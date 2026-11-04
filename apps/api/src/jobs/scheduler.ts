// Planification (§8.2) : les tâches périodiques (purges, puis récurrences en P4) ne s'exécutent
// que dans un seul passage cron à la fois, sous `GET_LOCK`. Le verrou est lié à une connexion :
// il est pris sur une connexion dédiée du pool, qui exécute aussi les tâches périodiques (un pool
// d'une seule connexion ne doit pas attendre la sienne), et libéré si le processus meurt.
import { createHash } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/mysql2';
import type { Pool, RowDataPacket } from 'mysql2';
import type { Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { job } from '../db/schema/index.js';

export const FINISHED_JOB_RETENTION_MS = 7 * 24 * 3_600_000;
/** Lignes supprimées par requête de purge : transactions courtes, verrous brefs. */
export const PURGE_BATCH = 1_000;

/**
 * Nom du verrou de planification. Les verrous `GET_LOCK` valent pour tout le serveur (mutualisé) :
 * le nom porte une empreinte de la base, de longueur fixe (MySQL 8 refuse plus de 64 caractères).
 */
export function scheduleLockName(database: string): string {
  return `depenseo.jobs.${createHash('sha256').update(database).digest('hex').slice(0, 32)}`;
}

export interface ScheduledTask {
  name: string;
  /** `db` : client lié à la connexion qui tient le verrou. Renvoie le nombre de lignes traitées. */
  run(db: Database, now: Date): Promise<number>;
}

/** Purge les tâches terminées depuis plus de 7 jours ; les tâches en échec restent pour diagnostic. */
export function purgeFinishedJobs(batchSize = PURGE_BATCH): ScheduledTask {
  return {
    name: 'purge-finished-jobs',
    async run(db, now) {
      const before = new Date(now.getTime() - FINISHED_JOB_RETENTION_MS);
      let total = 0;
      for (;;) {
        const [result] = await db
          .delete(job)
          .where(and(eq(job.status, 'done'), lt(job.finishedAt, before)))
          .limit(batchSize);
        total += result.affectedRows;
        if (result.affectedRows < batchSize) return total;
      }
    },
  };
}

export interface ScheduleResult {
  /** `false` si un autre passage tenait le verrou : rien n'a été exécuté. */
  ran: boolean;
  /** Lignes traitées par tâche périodique. */
  counts: Record<string, number>;
}

export async function runScheduledTasks(
  pool: Pool,
  clock: Clock,
  tasks: readonly ScheduledTask[],
): Promise<ScheduleResult> {
  const connection = await pool.promise().getConnection();
  // Connexion à fermer plutôt qu'à rendre au pool si le verrou n'a pas pu être relâché.
  let reusable = true;
  try {
    const [[current]] =
      await connection.query<({ db: string | null } & RowDataPacket)[]>('SELECT DATABASE() AS db');
    if (!current?.db) throw new Error('Aucune base sélectionnée pour la planification');
    const name = scheduleLockName(current.db);
    const [[lock]] = await connection.query<({ ok: number | null } & RowDataPacket)[]>(
      'SELECT GET_LOCK(?, 0) AS ok',
      [name],
    );
    if (lock?.ok !== 1) return { ran: false, counts: {} };
    try {
      const db = drizzle(connection.connection);
      const counts: Record<string, number> = {};
      for (const task of tasks) counts[task.name] = await task.run(db, clock.now());
      return { ran: true, counts };
    } finally {
      try {
        await connection.query('SELECT RELEASE_LOCK(?)', [name]);
      } catch {
        reusable = false;
      }
    }
  } finally {
    if (reusable) connection.release();
    else connection.destroy();
  }
}
