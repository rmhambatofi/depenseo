// Garde du back-office (F-ADM-01/03, NF-SEC-06, ADR-042). Toute route d'un `AdminController` exige
// une session admin valide (cookie) **et** un compte qui a encore le rôle et un secret TOTP ; sinon
// 404, identique à une route inexistante. Chaque accès accordé est inscrit au journal d'audit avant
// l'exécution de la route (un échec d'écriture refuse l'accès).
import {
  applyDecorators,
  type CanActivate,
  Controller,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiExcludeController } from '@nestjs/swagger';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Request } from 'express';
import { ADMIN_AREA } from '../auth/access-token.guard.js';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { user } from '../db/schema/index.js';
import { recordAdminAudit } from './admin-audit.js';
import {
  ADMIN_COOKIE,
  type AdminSession,
  enrollmentOf,
  readCookie,
} from './admin-session-token.js';
import { ADMIN_SETTINGS, type AdminSettings } from './admin-settings.js';

/** Préfixe des routes d'API du back-office, hors `/api/v1` (cookie `Path=/admin`). */
export const ADMIN_API_PREFIX = 'admin/api';

const ADMIN_LOGIN = Symbol('ADMIN_LOGIN');

/**
 * Contrôleur du back-office : `/admin/api/<path>`, garde admin, absent de l'OpenAPI public (aucun
 * code admin dans les clients générés, F-ADM-02).
 */
export const AdminController = (path: string) =>
  applyDecorators(
    Controller(`${ADMIN_API_PREFIX}/${path}`),
    SetMetadata(ADMIN_AREA, true),
    UseGuards(AdminGuard),
    ApiExcludeController(),
  );

/** Seule route admin sans session : la connexion (qui répond 404 à tout échec). */
export const AdminLogin = () => SetMetadata(ADMIN_LOGIN, true);

interface AdminRequest extends Request {
  adminSession?: AdminSession;
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ADMIN_SETTINGS) private readonly settings: AdminSettings | null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.settings) throw new NotFoundException();
    if (this.reflector.get<boolean | undefined>(ADMIN_LOGIN, context.getHandler())) return true;
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const now = this.clock.now();
    const token = readCookie(request.headers.cookie, ADMIN_COOKIE);
    const session = token ? await this.settings.tokens.verify(token, now) : undefined;
    if (!session) throw new NotFoundException();
    const [admin] = await this.db
      .select({ secret: user.adminTotpSecret })
      .from(user)
      .where(
        and(eq(user.id, session.userId), eq(user.role, 'admin'), isNotNull(user.adminTotpSecret)),
      );
    // Rôle retiré, ou secret réattribué depuis la connexion : session caduque.
    if (!admin?.secret || enrollmentOf(admin.secret) !== session.enrollment) {
      throw new NotFoundException();
    }
    const route = `${request.method} ${(request.route as { path?: string } | undefined)?.path ?? '?'}`;
    await recordAdminAudit(
      this.db,
      { actorUserId: session.userId, action: 'admin.access', route: route.slice(0, 160) },
      now,
    );
    request.adminSession = session;
    return true;
  }
}

/** Session admin vérifiée par `AdminGuard`. */
export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const session = context.switchToHttp().getRequest<AdminRequest>().adminSession;
  if (!session) throw new Error('CurrentAdmin hors d’une route admin authentifiée');
  return session;
});
