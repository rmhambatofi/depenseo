// Sessions (F-AUTH-01, NF-SEC-02, ADR-018) : ouverture après contrôle des identifiants, rotation
// du jeton de rafraîchissement à chaque usage, révocation de la famille sur réutilisation ou
// déconnexion. Une famille = une session d'un appareil, née à la connexion.
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock.js';
import { APP_CONFIG } from '../config/config.token.js';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { refreshToken, user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { newId } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import { AuthService } from './auth.service.js';
import { generateOpaqueToken, hashOpaqueToken, OPAQUE_TOKEN_PATTERN } from './opaque-token.js';
import {
  ACCESS_TOKEN_TTL_S,
  AccessTokens,
  REFRESH_TOKEN_TTL_S,
  type SessionTokens,
} from './session-tokens.js';

export const loginSchema = z.object({
  // Bornes larges : l'adresse est normalisée et contrôlée par `authenticate`, qui répond 401.
  email: z.string().max(320),
  password: z.string().max(1024),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().regex(OPAQUE_TOKEN_PATTERN),
});

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const INVALID_SESSION = 'Session invalide ou expirée';

@Injectable()
export class SessionService {
  readonly accessTokens: AccessTokens;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly auth: AuthService,
  ) {
    this.accessTokens = new AccessTokens(config.JWT_ACCESS_SECRET);
  }

  /** Contrôle e-mail + mot de passe (401/403) puis ouvre une nouvelle famille. */
  async login(email: string, password: string): Promise<SessionTokens> {
    const account = await this.auth.authenticate(email, password);
    const now = this.clock.now();
    const refresh = await withTransaction(this.db, (tx) =>
      this.insertRefreshToken(tx, account.id, newId(), now),
    );
    return this.tokens(account.id, refresh, now);
  }

  /**
   * Échange un jeton de rafraîchissement contre une nouvelle paire. Un jeton déjà utilisé ou
   * révoqué signale un vol possible : toute sa famille est révoquée. Les opérations de session
   * d'un compte sont sérialisées par le verrou de sa ligne `user` : sans lui, sous READ COMMITTED,
   * une révocation de famille concurrente d'une rotation pourrait manquer le successeur non encore
   * validé (pas de verrou de plage).
   */
  async refresh(token: string): Promise<SessionTokens> {
    const tokenHash = hashOpaqueToken(token);
    const now = this.clock.now();
    const outcome = await withTransaction(this.db, async (tx) => {
      const row = await this.lockedTokenRow(tx, tokenHash);
      if (!row) return undefined;
      if (row.usedAt !== null || row.revokedAt !== null) {
        await this.revokeFamily(tx, row.familyId, now);
        return undefined;
      }
      // Simplement expiré : refus sans révocation.
      if (row.expiresAt.getTime() <= now.getTime()) return undefined;
      await tx.update(refreshToken).set({ usedAt: now }).where(eq(refreshToken.id, row.id));
      const next = await this.insertRefreshToken(tx, row.userId, row.familyId, now);
      return { userId: row.userId, refresh: next };
    });
    if (!outcome) throw new ProblemException(401, INVALID_SESSION);
    return this.tokens(outcome.userId, outcome.refresh, now);
  }

  /** Révoque la famille du jeton présenté (cet appareil seulement). Silencieux si inconnu. */
  async logout(token: string): Promise<void> {
    const tokenHash = hashOpaqueToken(token);
    const now = this.clock.now();
    await withTransaction(this.db, async (tx) => {
      const row = await this.lockedTokenRow(tx, tokenHash);
      if (row) await this.revokeFamily(tx, row.familyId, now);
    });
  }

  /**
   * Ligne du jeton, relue après avoir verrouillé la ligne `user` de son titulaire (`FOR UPDATE`).
   * Sous READ COMMITTED, la seconde lecture voit tout ce qu'a validé la session concurrente.
   */
  private async lockedTokenRow(tx: Tx, tokenHash: Buffer) {
    const select = () =>
      tx
        .select({
          id: refreshToken.id,
          userId: refreshToken.userId,
          familyId: refreshToken.familyId,
          expiresAt: refreshToken.expiresAt,
          usedAt: refreshToken.usedAt,
          revokedAt: refreshToken.revokedAt,
        })
        .from(refreshToken)
        .where(eq(refreshToken.tokenHash, tokenHash));
    const [owner] = await select();
    if (!owner) return undefined;
    await tx.select({ id: user.id }).from(user).where(eq(user.id, owner.userId)).for('update');
    const [row] = await select();
    return row;
  }

  private async revokeFamily(tx: Tx, familyId: string, now: Date): Promise<void> {
    await tx
      .update(refreshToken)
      .set({ revokedAt: now })
      .where(and(eq(refreshToken.familyId, familyId), isNull(refreshToken.revokedAt)));
  }

  private async insertRefreshToken(
    tx: Tx,
    userId: string,
    familyId: string,
    now: Date,
  ): Promise<string> {
    const { token, tokenHash } = generateOpaqueToken();
    await tx.insert(refreshToken).values({
      id: newId(),
      userId,
      familyId,
      tokenHash,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_S * 1000),
      createdAt: now,
    });
    return token;
  }

  private async tokens(userId: string, refresh: string, now: Date): Promise<SessionTokens> {
    return {
      tokenType: 'Bearer',
      accessToken: await this.accessTokens.sign(userId, now),
      expiresIn: ACCESS_TOKEN_TTL_S,
      refreshToken: refresh,
      refreshExpiresIn: REFRESH_TOKEN_TTL_S,
    };
  }
}
