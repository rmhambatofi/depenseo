// Routes de consultation et d'exploitation du back-office (F-ADM-01, ADR-043), toutes sous
// `/admin/api/*`, gardées par `AdminGuard` (404 sans session, accès inscrit au journal d'audit).
import { Get, Header, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { isUuid } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import { parseQuery } from '../http/parse-query.js';
import { AdminController, CurrentAdmin } from './admin.guard.js';
import {
  AdminOpsService,
  type AdminAuditView,
  type AdminJobView,
  type AdminStats,
} from './admin-ops.service.js';
import {
  type AdminPage,
  auditListSchema,
  jobListSchema,
  subscriptionListSchema,
  userListSchema,
} from './admin-query.js';
import type { AdminSession } from './admin-session-token.js';
import {
  type AdminSubscriptionView,
  type AdminUserDetail,
  type AdminUserSummary,
  AdminUsersService,
} from './admin-users.service.js';

function pathId(value: string, missing: string): string {
  if (!isUuid(value)) throw new ProblemException(404, missing);
  return value.toLowerCase();
}

@AdminController('users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown): Promise<AdminPage<AdminUserSummary>> {
    return this.users.list(parseQuery(userListSchema, query));
  }

  @Get(':userId')
  @Header('Cache-Control', 'no-store')
  detail(
    @CurrentAdmin() admin: AdminSession,
    @Param('userId') userId: string,
  ): Promise<AdminUserDetail> {
    return this.users.detail(admin.userId, pathId(userId, 'Compte introuvable'));
  }
}

@AdminController('subscriptions')
export class AdminSubscriptionsController {
  constructor(private readonly ops: AdminOpsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown): Promise<AdminPage<AdminSubscriptionView>> {
    return this.ops.subscriptions(parseQuery(subscriptionListSchema, query));
  }
}

@AdminController('jobs')
export class AdminJobsController {
  constructor(private readonly ops: AdminOpsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown): Promise<AdminPage<AdminJobView>> {
    return this.ops.jobs(parseQuery(jobListSchema, query));
  }

  @Post(':jobId/retry')
  @HttpCode(HttpStatus.NO_CONTENT)
  retry(@CurrentAdmin() admin: AdminSession, @Param('jobId') jobId: string): Promise<void> {
    return this.ops.retryJob(admin.userId, pathId(jobId, 'Tâche introuvable'));
  }
}

@AdminController('stats')
export class AdminStatsController {
  constructor(private readonly ops: AdminOpsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  stats(): Promise<AdminStats> {
    return this.ops.stats();
  }
}

@AdminController('audit')
export class AdminAuditController {
  constructor(private readonly ops: AdminOpsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown): Promise<AdminPage<AdminAuditView>> {
    return this.ops.audit(parseQuery(auditListSchema, query));
  }
}
