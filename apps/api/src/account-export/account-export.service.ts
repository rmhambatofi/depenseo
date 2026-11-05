// Export RGPD des données du compte (F-AUTH-08, ADR-038) : demande (tâche de fond), état,
// téléchargement de l'archive déchiffrée tant que le lien est valide (15 min après génération).
// Seul le compte demandeur voit ses demandes ; sinon 404 sans distinction.
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { accountExport, user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { isUuid } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import type { ExportState } from '../exports/exports.service.js';
import { FileDecryptionError } from '../exports/file-crypto.js';
import type { EncryptedFileStore } from '../exports/file-store.js';
import { FILE_STORE } from '../exports/file-store.token.js';
import { uuidV7 } from '../http/uuid-schemas.js';
import { JobQueue } from '../jobs/job-queue.js';
import { GENERATE_ACCOUNT_EXPORT } from './account-export-job.js';

export const accountExportRequestSchema = z.strictObject({ id: uuidV7 });
export type AccountExportRequest = z.infer<typeof accountExportRequestSchema>;

export interface AccountExportView {
  id: string;
  status: ExportState;
  /** Fin de validité du lien (ISO 8601 UTC), dès que l'archive est prête. */
  expiresAt: string | null;
}

export const ACCOUNT_EXPORT_CONTENT_TYPE = 'application/zip';

const NOT_FOUND = 'Export introuvable ou expiré';

type Row = typeof accountExport.$inferSelect;

@Injectable()
export class AccountExportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FILE_STORE) private readonly files: EncryptedFileStore | null,
  ) {}

  async request(userId: string, input: AccountExportRequest): Promise<AccountExportView> {
    if (!this.files) throw new ProblemException(503, 'Exports indisponibles');
    return withTransaction(this.db, async (tx) => {
      // Verrou du compte : sérialise avec `DELETE /me` (même ordre de verrous, ADR-037).
      const [account] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, userId))
        .for('update');
      if (!account) throw new ProblemException(401, 'Compte supprimé');
      const [existing] = await tx
        .select()
        .from(accountExport)
        .where(eq(accountExport.id, input.id));
      if (existing) {
        if (existing.userId !== userId) throw new ProblemException(409, 'Identifiant déjà utilisé');
        return this.view(existing);
      }
      const now = this.clock.now();
      const row: Row = {
        id: input.id,
        userId,
        status: 'pending',
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await tx.insert(accountExport).values(row);
      await new JobQueue(this.clock).enqueue(
        tx,
        GENERATE_ACCOUNT_EXPORT,
        { exportId: input.id },
        { uniqueKey: `account-export:${input.id}` },
      );
      return this.view(row);
    });
  }

  async get(userId: string, exportId: string): Promise<AccountExportView> {
    return this.view(await this.find(userId, exportId));
  }

  async download(userId: string, exportId: string): Promise<Buffer> {
    const row = await this.find(userId, exportId);
    if (this.state(row) !== 'ready' || !this.files) throw new ProblemException(404, NOT_FOUND);
    // Fichier absent ou illisible (rotation de clé, fichier abîmé) : l'utilisateur relance.
    const content = await this.files.read(exportId).catch((error: unknown) => {
      if (error instanceof FileDecryptionError) return undefined;
      throw error;
    });
    if (!content) throw new ProblemException(404, NOT_FOUND);
    return content;
  }

  private async find(userId: string, exportId: string): Promise<Row> {
    if (!isUuid(exportId)) throw new ProblemException(404, NOT_FOUND);
    const [row] = await this.db
      .select()
      .from(accountExport)
      .where(and(eq(accountExport.id, exportId), eq(accountExport.userId, userId)));
    if (!row) throw new ProblemException(404, NOT_FOUND);
    return row;
  }

  private state(row: Row): ExportState {
    if (row.status !== 'ready') return row.status;
    return row.expiresAt !== null && this.clock.now() < row.expiresAt ? 'ready' : 'expired';
  }

  private view(row: Row): AccountExportView {
    return { id: row.id, status: this.state(row), expiresAt: row.expiresAt?.toISOString() ?? null };
  }
}
