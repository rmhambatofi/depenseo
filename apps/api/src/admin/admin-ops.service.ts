// Exploitation vue du back-office (F-ADM-01, ADR-043) : abonnements, tâches de fond, statistiques
// agrégées, journal d'audit. Aucun montant, aucune charge utile de tâche, aucune adresse e-mail.
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  type Column,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { auditLog, expense, job, subscription, user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { ProblemException } from '../errors/problem.exception.js';
import { recordAdminAudit } from './admin-audit.js';
import {
  type AdminPage,
  type AuditListQuery,
  type JobListQuery,
  type SubscriptionListQuery,
  toPage,
} from './admin-query.js';
import {
  type AdminSubscriptionView,
  subscriptionColumns,
  subscriptionView,
} from './admin-users.service.js';

export const STATS_DAYS = 30;
const DAY_MS = 86_400_000;

export interface AdminJobView {
  id: string;
  type: string;
  status: string;
  attempts: number;
  lastError: string | null;
  runAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export interface AdminAuditView {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  route: string | null;
  createdAt: string;
}

export interface AdminStats {
  generatedAt: string;
  users: { total: number; verified: number; admins: number };
  /** Inscriptions par jour UTC, du plus ancien au plus récent, sur `STATS_DAYS` jours. */
  signups: { date: string; count: number }[];
  plans: { premium: number; trial: number };
  subscriptions: { byStatus: Record<string, number>; byStore: Record<string, number> };
  expenses: { total: number; createdLast30Days: number }; // mêmes 30 jours UTC que `signups`;
  jobs: Record<string, number>;
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

function cursorCondition(
  at: Column,
  id: Column,
  cursor: { at: Date; id: string } | undefined,
): SQL | undefined {
  if (!cursor) return undefined;
  return or(lt(at, cursor.at), and(eq(at, cursor.at), lt(id, cursor.id)));
}

const tally = (rows: { key: string; n: number }[]) =>
  Object.fromEntries(rows.map((r) => [r.key, r.n]));

/** Jour UTC `AAAA-MM-JJ` d'un instant (la session SQL est en `+00:00`). */
const utcDay = (instant: Date) => instant.toISOString().slice(0, 10);

@Injectable()
export class AdminOpsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async subscriptions(query: SubscriptionListQuery): Promise<AdminPage<AdminSubscriptionView>> {
    const rows = await this.db
      .select(subscriptionColumns)
      .from(subscription)
      .where(
        and(
          query.userId ? eq(subscription.userId, query.userId) : undefined,
          query.store ? eq(subscription.store, query.store) : undefined,
          query.status ? eq(subscription.status, query.status) : undefined,
          cursorCondition(subscription.createdAt, subscription.id, query.cursor),
        ),
      )
      .orderBy(desc(subscription.createdAt), desc(subscription.id))
      .limit(query.limit + 1);
    return toPage(rows, query.limit, (r) => r.createdAt, subscriptionView);
  }

  async jobs(query: JobListQuery): Promise<AdminPage<AdminJobView>> {
    const rows = await this.db
      .select({
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        lastError: job.lastError,
        runAt: job.runAt,
        finishedAt: job.finishedAt,
        createdAt: job.createdAt,
      })
      .from(job)
      .where(
        and(eq(job.status, query.status), cursorCondition(job.createdAt, job.id, query.cursor)),
      )
      .orderBy(desc(job.createdAt), desc(job.id))
      .limit(query.limit + 1);
    return toPage(
      rows,
      query.limit,
      (r) => r.createdAt,
      (r) => ({
        ...r,
        runAt: r.runAt.toISOString(),
        finishedAt: iso(r.finishedAt),
        createdAt: r.createdAt.toISOString(),
      }),
    );
  }

  /**
   * Relance d'une tâche en échec : nouvelle série de 5 essais, exécutable au prochain passage du
   * cron. Seul le statut `failed` se relance (une tâche en cours ou réussie → 409).
   */
  async retryJob(adminUserId: string, jobId: string): Promise<void> {
    const now = this.clock.now();
    await withTransaction(this.db, async (tx) => {
      const [found] = await tx
        .select({ status: job.status })
        .from(job)
        .where(eq(job.id, jobId))
        .for('update');
      if (!found) throw new ProblemException(404, 'Tâche introuvable');
      if (found.status !== 'failed') {
        throw new ProblemException(409, 'Seule une tâche en échec peut être relancée');
      }
      await tx
        .update(job)
        .set({
          status: 'pending',
          attempts: 0,
          runAt: now,
          lockedUntil: null,
          lastError: null,
          finishedAt: null,
          updatedAt: now,
        })
        .where(eq(job.id, jobId));
      await recordAdminAudit(
        tx,
        { actorUserId: adminUserId, action: 'admin.job_retry', targetType: 'job', targetId: jobId },
        now,
      );
    });
  }

  async audit(query: AuditListQuery): Promise<AdminPage<AdminAuditView>> {
    const rows = await this.db
      .select({
        id: auditLog.id,
        actorUserId: auditLog.actorUserId,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        route: auditLog.route,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(
        and(
          query.actorUserId ? eq(auditLog.actorUserId, query.actorUserId) : undefined,
          query.targetId ? eq(auditLog.targetId, query.targetId) : undefined,
          query.action ? eq(auditLog.action, query.action) : undefined,
          cursorCondition(auditLog.createdAt, auditLog.id, query.cursor),
        ),
      )
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(query.limit + 1);
    return toPage(
      rows,
      query.limit,
      (r) => r.createdAt,
      (r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }),
    );
  }

  /** Compteurs globaux uniquement : aucune somme, aucun montant (NF-SEC-06). */
  async stats(): Promise<AdminStats> {
    const now = this.clock.now();
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    firstDay.setUTCDate(firstDay.getUTCDate() - (STATS_DAYS - 1));
    const activeSub = and(eq(subscription.status, 'active'), gt(subscription.expiresAt, now));

    const [users] = await this.db
      .select({
        total: count(),
        verified:
          sql<number>`cast(coalesce(sum(${user.emailVerifiedAt} is not null), 0) as unsigned)`.mapWith(
            Number,
          ),
        admins: sql<number>`cast(coalesce(sum(${user.role} = 'admin'), 0) as unsigned)`.mapWith(
          Number,
        ),
      })
      .from(user);
    const day = sql<string>`date_format(${user.createdAt}, '%Y-%m-%d')`;
    const signupRows = await this.db
      .select({ date: day, n: count() })
      .from(user)
      .where(gte(user.createdAt, firstDay))
      .groupBy(day);
    const signups = Array.from({ length: STATS_DAYS }, (_, i) => {
      const date = utcDay(new Date(firstDay.getTime() + i * DAY_MS));
      return { date, count: signupRows.find((r) => r.date === date)?.n ?? 0 };
    });
    const [premium] = await this.db
      .select({ n: countDistinct(subscription.userId) })
      .from(subscription)
      .where(activeSub);
    const [trial] = await this.db
      .select({ n: count() })
      .from(user)
      .where(
        and(
          gt(user.trialEndsAt, now),
          sql`not exists (select 1 from ${subscription} where ${subscription.userId} = ${user.id} and ${activeSub})`,
        ),
      );
    const byStatus = await this.db
      .select({ key: subscription.status, n: count() })
      .from(subscription)
      .groupBy(subscription.status);
    const byStore = await this.db
      .select({ key: subscription.store, n: count() })
      .from(subscription)
      .where(activeSub)
      .groupBy(subscription.store);
    const [expenses] = await this.db
      .select({
        total: count(),
        recent:
          sql<number>`cast(coalesce(sum(${expense.createdAt} >= ${firstDay}), 0) as unsigned)`.mapWith(
            Number,
          ),
      })
      .from(expense)
      .where(isNull(expense.deletedAt));
    const jobs = await this.db
      .select({ key: job.status, n: count() })
      .from(job)
      .groupBy(job.status);
    return {
      generatedAt: now.toISOString(),
      users: {
        total: users?.total ?? 0,
        verified: users?.verified ?? 0,
        admins: users?.admins ?? 0,
      },
      signups,
      plans: { premium: premium?.n ?? 0, trial: trial?.n ?? 0 },
      subscriptions: { byStatus: tally(byStatus), byStore: tally(byStore) },
      expenses: { total: expenses?.total ?? 0, createdLast30Days: expenses?.recent ?? 0 },
      jobs: tally(jobs),
    };
  }
}
