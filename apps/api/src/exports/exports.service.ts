// Exports de dépenses (F-EXP-01, ADR-036) : demande (tâche de fond), état, téléchargement du
// fichier déchiffré tant que le lien est valide (15 min après génération). Seul le demandeur voit
// et télécharge son export ; ailleurs, 404 sans distinction.
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { exportFile } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { isUuid } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import { JobQueue } from '../jobs/job-queue.js';
import { canExportExcel, loadEntitlements } from '../subscriptions/entitlements.js';
import { lockNotebook } from '../notebooks/notebook-lock.js';
import { GENERATE_EXPORT } from './export-job.js';
import { EXPORT_CONTENT_TYPES, type ExportFormat } from './export-format.js';
import { FileDecryptionError } from './file-crypto.js';
import { FILE_STORE } from './file-store.token.js';
import type { EncryptedFileStore } from './file-store.js';
import type { ExportRequest } from './export-input.js';

export type ExportState = 'pending' | 'ready' | 'expired' | 'failed';

export interface ExportView {
  id: string;
  format: ExportFormat;
  from: string;
  to: string;
  status: ExportState;
  /** Fin de validité du lien (ISO 8601 UTC), dès que le fichier est prêt. */
  expiresAt: string | null;
}

export interface ExportDownload {
  content: Buffer;
  contentType: string;
  fileName: string;
}

const NOT_FOUND = 'Export introuvable ou expiré';

type Row = typeof exportFile.$inferSelect;

@Injectable()
export class ExportsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FILE_STORE) private readonly files: EncryptedFileStore | null,
  ) {}

  async request(notebookId: string, userId: string, input: ExportRequest): Promise<ExportView> {
    if (!this.files) throw new ProblemException(503, 'Exports indisponibles');
    return withTransaction(this.db, async (tx) => {
      await lockNotebook(tx, notebookId);
      const [existing] = await tx.select().from(exportFile).where(eq(exportFile.id, input.id));
      if (existing) {
        const same =
          existing.notebookId === notebookId &&
          existing.userId === userId &&
          existing.format === input.format &&
          existing.dateFrom === input.from &&
          existing.dateTo === input.to &&
          existing.deletedAt === null;
        if (!same) throw new ProblemException(409, 'Identifiant déjà utilisé');
        return this.view(existing);
      }
      if (input.format === 'xlsx') {
        const rights = await loadEntitlements(tx, userId, this.clock.now());
        if (!canExportExcel(rights)) {
          throw new ProblemException(403, 'Export Excel réservé à l’offre Premium');
        }
      }
      const now = this.clock.now();
      const row: Row = {
        id: input.id,
        notebookId,
        userId,
        format: input.format,
        dateFrom: input.from,
        dateTo: input.to,
        status: 'pending',
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await tx.insert(exportFile).values(row);
      await new JobQueue(this.clock).enqueue(
        tx,
        GENERATE_EXPORT,
        { exportId: input.id },
        { uniqueKey: `export:${input.id}` },
      );
      return this.view(row);
    });
  }

  async get(notebookId: string, userId: string, exportId: string): Promise<ExportView> {
    return this.view(await this.find(notebookId, userId, exportId));
  }

  async download(notebookId: string, userId: string, exportId: string): Promise<ExportDownload> {
    const row = await this.find(notebookId, userId, exportId);
    if (this.state(row) !== 'ready' || !this.files) throw new ProblemException(404, NOT_FOUND);
    // Fichier absent, ou illisible (clé changée par rotation, fichier abîmé) : l'utilisateur relance.
    const content = await this.files.read(exportId).catch((error: unknown) => {
      if (error instanceof FileDecryptionError) return undefined;
      throw error;
    });
    if (!content) throw new ProblemException(404, NOT_FOUND);
    return {
      content,
      contentType: EXPORT_CONTENT_TYPES[row.format],
      fileName: `depenseo_${row.dateFrom}_${row.dateTo}.${row.format}`,
    };
  }

  private async find(notebookId: string, userId: string, exportId: string): Promise<Row> {
    if (!isUuid(exportId)) throw new ProblemException(404, NOT_FOUND);
    const [row] = await this.db
      .select()
      .from(exportFile)
      .where(
        and(
          eq(exportFile.id, exportId),
          eq(exportFile.notebookId, notebookId),
          eq(exportFile.userId, userId),
          isNull(exportFile.deletedAt),
        ),
      );
    if (!row) throw new ProblemException(404, NOT_FOUND);
    return row;
  }

  private state(row: Row): ExportState {
    if (row.status !== 'ready') return row.status;
    return row.expiresAt !== null && this.clock.now() < row.expiresAt ? 'ready' : 'expired';
  }

  private view(row: Row): ExportView {
    return {
      id: row.id,
      format: row.format,
      from: row.dateFrom,
      to: row.dateTo,
      status: this.state(row),
      expiresAt: row.expiresAt?.toISOString() ?? null,
    };
  }
}
