// Connexion Apple / Google (F-AUTH-02, ADR-020) : identité retrouvée par (fournisseur, `sub`) ; à
// défaut, rattachement au compte de même adresse si le fournisseur fait autorité sur elle, ou création.
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { IDENTITY_PROVIDERS, user, userIdentity } from '../db/schema/index.js';
import { ER_DUP_ENTRY, hasErrno, withTransaction } from '../db/transaction.js';
import { newId } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import { emailSchema, LANGUAGES } from './auth.service.js';
import {
  ID_TOKEN_VERIFIER,
  type IdTokenVerifier,
  InvalidIdTokenError,
  ProviderUnavailableError,
  type VerifiedIdentity,
} from './id-token-verifier.js';
import { SessionService, type Tx } from './session.service.js';
import type { SessionTokens } from './session-tokens.js';

export const socialLoginSchema = z.object({
  provider: z.enum(IDENTITY_PROVIDERS),
  idToken: z.string().min(1).max(8192),
  /** Nonce brut tiré par l'app ; le fournisseur a reçu (et signé) son SHA-256 hexadécimal. */
  nonce: z.string().min(16).max(128),
  /** Exigé pour créer un compte ou reprendre un compte non vérifié (sinon 422). */
  acceptTerms: z.literal(true).optional(),
  /** Langue d'un compte créé ou repris ; ignorée pour un compte vérifié. */
  language: z.enum(LANGUAGES).default('fr'),
});
export type SocialLoginInput = z.infer<typeof socialLoginSchema>;

const REFUSALS = {
  'no-email': [403, 'Adresse e-mail non vérifiée ou inutilisable'],
  'terms-required': [422, 'Acceptation des CGU requise'],
  'link-refused': [
    409,
    'Un compte existe déjà avec cette adresse : connexion par e-mail ou réinitialisation',
  ],
} as const;
type Refusal = keyof typeof REFUSALS;

/** Identité rattachée en parallèle après la création d'un compte : annule (compte compris) et rejoue. */
class IdentityRaced extends Error {
  override readonly name = 'IdentityRaced';
}

@Injectable()
export class SocialLoginService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_TOKEN_VERIFIER) private readonly verifier: IdTokenVerifier,
    private readonly sessions: SessionService,
  ) {}

  async signIn(input: SocialLoginInput): Promise<SessionTokens> {
    const identity = await this.verify(input);
    const subjectHash = createHash('sha256').update(identity.subject, 'utf8').digest();
    const parsedEmail = emailSchema.safeParse(identity.verifiedEmail);
    const email = parsedEmail.success ? parsedEmail.data : undefined;
    const now = this.clock.now();

    const attempt = () =>
      withTransaction(this.db, async (tx) => {
        const resolved = await this.resolve(tx, input, identity, subjectHash, email, now);
        if (typeof resolved === 'string') return resolved;
        return this.sessions.openSession(tx, resolved.userId, now);
      });
    let result: SessionTokens | Refusal;
    try {
      result = await attempt();
    } catch (error) {
      // Même `sub` rattaché en parallèle à un autre compte (adresses différentes, donc verrous
      // différents) : l'unicité (fournisseur, sub) refuse l'un, ou il voit l'identité après avoir
      // créé son compte ; sa transaction est annulée et le rejeu retrouve l'identité.
      if (!(error instanceof IdentityRaced) && !hasErrno(error, ER_DUP_ENTRY)) throw error;
      result = await attempt();
    }
    if (typeof result === 'string') {
      const [status, detail] = REFUSALS[result];
      throw new ProblemException(status, detail);
    }
    return result;
  }

  private async verify(input: SocialLoginInput): Promise<VerifiedIdentity> {
    try {
      return await this.verifier.verify(input.provider, input.idToken, input.nonce);
    } catch (error) {
      if (error instanceof InvalidIdTokenError) {
        throw new ProblemException(401, 'Jeton d’identité invalide');
      }
      if (error instanceof ProviderUnavailableError) {
        throw new ProblemException(503, 'Fournisseur d’identité non disponible');
      }
      throw error;
    }
  }

  /**
   * Compte de l'identité. Le rattachement par adresse verrouille la ligne `user` (upsert ou
   * `FOR UPDATE`) puis relit l'identité : deux premières connexions simultanées de la même identité
   * et de la même adresse sont sérialisées et n'en créent qu'une.
   */
  private async resolve(
    tx: Tx,
    input: SocialLoginInput,
    identity: VerifiedIdentity,
    subjectHash: Buffer,
    email: string | undefined,
    now: Date,
  ): Promise<{ userId: string } | Refusal> {
    const linked = await this.linkedUser(tx, identity, subjectHash);
    if (linked) return { userId: linked };
    if (email === undefined) return 'no-email';

    const lockAccount = () =>
      tx
        .select({ id: user.id, verifiedAt: user.emailVerifiedAt })
        .from(user)
        .where(eq(user.email, email))
        .for('update');
    let [account] = await lockAccount();
    let created = false;
    if (!account) {
      if (input.acceptTerms !== true) return 'terms-required';
      // Upsert : une création concurrente de la même adresse attend ici puis ne fait rien.
      const id = newId();
      await tx
        .insert(user)
        .values({
          id,
          email,
          emailVerifiedAt: now,
          passwordHash: null,
          language: input.language,
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({ set: { id: sql`${user.id}` } });
      [account] = await lockAccount();
      if (!account) throw new Error('Compte introuvable après insertion');
      created = account.id === id;
    }

    const raced = await this.linkedUser(tx, identity, subjectHash);
    if (raced && created) throw new IdentityRaced();
    if (raced) return { userId: raced };

    // Compte préexistant : seul un fournisseur qui fait autorité sur l'adresse peut y donner accès.
    if (!created && !identity.emailAuthoritative) return 'link-refused';
    if (!account.verifiedAt) {
      // Le fournisseur prouve la possession de l'adresse. Mot de passe, consentements et langue
      // ont pu être posés par un tiers (pré-inscription, ADR-017) : effacés ou repris du titulaire.
      if (input.acceptTerms !== true) return 'terms-required';
      await tx
        .update(user)
        .set({
          emailVerifiedAt: now,
          passwordHash: null,
          language: input.language,
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
          updatedAt: now,
        })
        .where(eq(user.id, account.id));
    }
    await tx.insert(userIdentity).values({
      id: newId(),
      userId: account.id,
      provider: identity.provider,
      subjectHash,
      createdAt: now,
    });
    return { userId: account.id };
  }

  private async linkedUser(
    tx: Tx,
    identity: VerifiedIdentity,
    subjectHash: Buffer,
  ): Promise<string | undefined> {
    const [row] = await tx
      .select({ userId: userIdentity.userId })
      .from(userIdentity)
      .where(
        and(
          eq(userIdentity.provider, identity.provider),
          eq(userIdentity.subjectHash, subjectHash),
        ),
      );
    return row?.userId;
  }
}
