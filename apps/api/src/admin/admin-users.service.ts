// Comptes vus du back-office (F-ADM-01, ADR-043). Minimisation (§RGPD, NF-SEC-06) : jamais de
// montant, de note, de marchand, de catégorie, de jeton ni d'empreinte ; des compteurs seulement.
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, lt, or, type SQL, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { device, expense, notebook, subscription, user, userIdentity } from '../db/schema/index.js';
import type { UserRole } from '../db/schema/user.js';
import { ProblemException } from '../errors/problem.exception.js';
import { loadEntitlements, type Plan } from '../subscriptions/entitlements.js';
import { recordAdminAudit } from './admin-audit.js';
import { type AdminPage, toPage, type UserListQuery } from './admin-query.js';

export interface AdminUserSummary {
  id: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  createdAt: string;
}

export interface AdminSubscriptionView {
  id: string;
  userId: string;
  store: string;
  productCode: string;
  status: string;
  expiresAt: string;
  verifiedAt: string;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  language: string;
  timeZone: string;
  currency: string;
  hasPassword: boolean;
  providers: string[];
  devices: { ios: number; android: number };
  notebooks: number;
  expenses: number;
  plan: Plan;
  premiumUntil: string | null;
  trialEndsAt: string | null;
  subscriptions: AdminSubscriptionView[];
}

const summaryColumns = {
  id: user.id,
  email: user.email,
  emailVerifiedAt: user.emailVerifiedAt,
  role: user.role,
  createdAt: user.createdAt,
};

type SummaryRow = {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  role: UserRole;
  createdAt: Date;
};

const summary = (row: SummaryRow): AdminUserSummary => ({
  id: row.id,
  email: row.email,
  emailVerified: row.emailVerifiedAt !== null,
  role: row.role,
  createdAt: row.createdAt.toISOString(),
});

export const subscriptionView = (row: {
  id: string;
  userId: string;
  store: string;
  productCode: string;
  status: string;
  expiresAt: Date;
  verifiedAt: Date;
  createdAt: Date;
}): AdminSubscriptionView => ({
  ...row,
  expiresAt: row.expiresAt.toISOString(),
  verifiedAt: row.verifiedAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

export const subscriptionColumns = {
  id: subscription.id,
  userId: subscription.userId,
  store: subscription.store,
  productCode: subscription.productCode,
  status: subscription.status,
  expiresAt: subscription.expiresAt,
  verifiedAt: subscription.verifiedAt,
  createdAt: subscription.createdAt,
};

const NOT_FOUND = 'Compte introuvable';

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(query: UserListQuery): Promise<AdminPage<AdminUserSummary>> {
    const conditions: (SQL | undefined)[] = [];
    if (query.q !== undefined) {
      const pattern = `%${query.q.replace(/[!%_]/g, '!$&')}%`;
      conditions.push(sql`${user.email} like ${pattern} escape '!'`);
    }
    if (query.cursor) {
      const { at, id } = query.cursor;
      conditions.push(or(lt(user.createdAt, at), and(eq(user.createdAt, at), lt(user.id, id))));
    }
    const rows = await this.db
      .select(summaryColumns)
      .from(user)
      .where(and(...conditions))
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(query.limit + 1);
    return toPage(rows, query.limit, (r) => r.createdAt, summary);
  }

  /** Fiche d'un compte ; la consultation est tracée avec le compte visé (NF-SEC-06). */
  async detail(adminUserId: string, userId: string): Promise<AdminUserDetail> {
    const now = this.clock.now();
    const [account] = await this.db
      .select({
        ...summaryColumns,
        language: user.language,
        timeZone: user.timeZone,
        currency: user.currency,
        passwordHash: user.passwordHash,
      })
      .from(user)
      .where(eq(user.id, userId));
    if (!account) throw new ProblemException(404, NOT_FOUND);
    await recordAdminAudit(
      this.db,
      { actorUserId: adminUserId, action: 'admin.user_view', targetType: 'user', targetId: userId },
      now,
    );
    const providers = await this.db
      .select({ provider: userIdentity.provider })
      .from(userIdentity)
      .where(eq(userIdentity.userId, userId))
      .orderBy(userIdentity.provider);
    const devices = await this.db
      .select({ platform: device.platform, n: count() })
      .from(device)
      .where(eq(device.userId, userId))
      .groupBy(device.platform);
    const [notebooks] = await this.db
      .select({ n: count() })
      .from(notebook)
      .where(and(eq(notebook.ownerId, userId), isNull(notebook.deletedAt)));
    const [expenses] = await this.db
      .select({ n: count() })
      .from(expense)
      .innerJoin(notebook, eq(notebook.id, expense.notebookId))
      .where(
        and(eq(notebook.ownerId, userId), isNull(notebook.deletedAt), isNull(expense.deletedAt)),
      );
    const subscriptions = await this.db
      .select(subscriptionColumns)
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .orderBy(desc(subscription.createdAt), desc(subscription.id));
    const rights = await loadEntitlements(this.db, userId, now);
    const devicesOf = (platform: string) => devices.find((d) => d.platform === platform)?.n ?? 0;
    return {
      ...summary(account),
      language: account.language,
      timeZone: account.timeZone,
      currency: account.currency,
      hasPassword: account.passwordHash !== null,
      providers: providers.map((p) => p.provider),
      devices: { ios: devicesOf('ios'), android: devicesOf('android') },
      notebooks: notebooks?.n ?? 0,
      expenses: expenses?.n ?? 0,
      plan: rights.plan,
      premiumUntil: rights.premiumUntil?.toISOString() ?? null,
      trialEndsAt: rights.trialEndsAt?.toISOString() ?? null,
      subscriptions: subscriptions.map(subscriptionView),
    };
  }
}
