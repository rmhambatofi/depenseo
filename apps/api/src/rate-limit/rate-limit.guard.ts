// Garde de limitation de débit des routes d'authentification (NF-SEC-04, ADR-062).
import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTooManyRequestsResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CLOCK, type Clock } from '../clock.js';
import { APP_CONFIG } from '../config/config.token.js';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { ProblemException } from '../errors/problem.exception.js';
import { consume, type RateLimitBucket, rateLimitKey } from './rate-limiter.js';

const RATE_LIMIT = Symbol('RATE_LIMIT');

interface RateLimitOptions {
  /** Compte aussi par adresse e-mail du corps (`email`) : freine l'attaque répartie sur un compte. */
  perAccount?: boolean;
}

/**
 * Plafonne les appels par adresse IP (et par compte si demandé) sur 15 min ; au-delà, 429 avec
 * `Retry-After`. À poser sur la méthode, à côté de `@Public()`.
 */
export const RateLimited = (options: RateLimitOptions = {}) =>
  applyDecorators(
    SetMetadata(RATE_LIMIT, options),
    UseGuards(RateLimitGuard),
    ApiTooManyRequestsResponse({ description: 'Trop de tentatives ; réessayer après Retry-After' }),
  );

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.key = rateLimitKey(config.JWT_ACCESS_SECRET);
  }

  private readonly key: Buffer;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions | undefined>(
      RATE_LIMIT,
      context.getHandler(),
    );
    if (!options) return true;
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    // `req.ip` suit `TRUST_PROXY_HOPS`. Adresse inconnue (socket Unix) : pas de seau IP, plutôt
    // qu'un seau commun à tous les clients qu'un tiers saturerait en 30 requêtes.
    const buckets: RateLimitBucket[] = [];
    if (req.ip) {
      buckets.push({ scope: 'ip', value: req.ip, max: this.config.AUTH_RATE_LIMIT_PER_IP });
    }
    const email: unknown = (req.body as Record<string, unknown> | undefined)?.email;
    if (options.perAccount && typeof email === 'string') {
      buckets.push({
        // Même normalisation que `emailSchema` : casse et espaces ne créent pas un nouveau seau.
        scope: 'account',
        value: email.trim().toLowerCase(),
        max: this.config.AUTH_RATE_LIMIT_PER_ACCOUNT,
      });
    }
    const decision = await consume(this.db, this.key, buckets, this.clock.now());
    if (decision.allowed) return true;
    http.getResponse<Response>().setHeader('Retry-After', String(decision.retryAfterS));
    throw new ProblemException(
      HttpStatus.TOO_MANY_REQUESTS,
      'Trop de tentatives. Réessayez dans quelques minutes.',
    );
  }
}
