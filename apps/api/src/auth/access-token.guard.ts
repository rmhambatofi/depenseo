// Garde globale (§8.3, ADR-018) : toute route exige un jeton d'accès valide, sauf celles marquées
// `@Public()`. Une route oubliée est donc fermée par défaut.
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { CLOCK, type Clock } from '../clock.js';
import { ProblemException } from '../errors/problem.exception.js';
import { SessionService } from './session.service.js';

export const IS_PUBLIC = Symbol('IS_PUBLIC');

/**
 * Route accessible sans jeton d'accès (sonde, connexion, inscription…). À poser route par route,
 * jamais sur une classe : la liste blanche est figée par `test/auth/public-routes.spec.ts`.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Contrôleur du back-office (`AdminController`, ADR-042) : authentifié par le cookie de session
 * admin et sa propre garde, jamais par un jeton Bearer. Posé sur la classe.
 */
export const ADMIN_AREA = Symbol('ADMIN_AREA');

/** Express route sans tenir compte de la casse : `/ADMIN/` atteint aussi les routes `/admin`. */
const isAdminPath = (path: string) => /^\/admin(?:\/|$)/i.test(path);

export interface Principal {
  userId: string;
}

interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

/** Schéma insensible à la casse (RFC 7235) ; la forme JWS est contrôlée par jose. */
const BEARER = /^Bearer +(\S+)$/i;

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Méthode seulement : un `@Public()` posé sur une classe est sans effet.
    const isPublic = this.reflector.get<boolean | undefined>(IS_PUBLIC, context.getHandler());
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Le back-office a sa garde (`AdminGuard`, 404 sans session admin) : pas de 401 Bearer ici.
    // Sous /admin seulement : toute route y est éprouvée par `test/admin/admin-access.spec.ts`.
    if (
      this.reflector.get<boolean | undefined>(ADMIN_AREA, context.getClass()) &&
      isAdminPath(request.path)
    ) {
      return true;
    }
    const match = BEARER.exec(request.headers.authorization ?? '');
    const userId = match
      ? await this.sessions.accessTokens.verify(match[1]!, this.clock.now())
      : undefined;
    if (!userId) {
      // RFC 6750 §3. Le back-office (404) est traité plus haut (ADR-042).
      context.switchToHttp().getResponse<Response>().setHeader('WWW-Authenticate', 'Bearer');
      throw new ProblemException(401, 'Authentification requise');
    }
    request.principal = { userId };
    return true;
  }
}

/** Compte authentifié par `AccessTokenGuard`. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
  if (!principal) throw new Error('CurrentUser sur une route publique');
  return principal;
});
