// Mots de passe (F-AUTH-01, ADR-017) : argon2id aux paramètres minimaux recommandés par l'OWASP
// (19 Mio, 2 passes, 1 fil), chaîne PHC stockée dans `user.password_hash`.
import { type Algorithm, hash, verify } from '@node-rs/argon2';

/** Bornes en caractères (NIST SP 800-63B : au moins 8, accepter les phrases de passe longues). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const OPTIONS = {
  // `Algorithm` est un `const enum` ambiant, inutilisable comme valeur sous `isolatedModules`.
  algorithm: 2 as Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** Empreinte d'un mot de passe aléatoire, calculée une fois : sert à égaliser le temps de réponse. */
let dummyHash: Promise<string> | undefined;

/**
 * Vérifie un mot de passe. Sans empreinte (compte inconnu ou créé par Apple/Google), un calcul
 * argon2 est quand même fait pour ne pas révéler l'existence du compte par le temps de réponse.
 */
export async function verifyPassword(
  passwordHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!passwordHash) {
    dummyHash ??= hashPassword(crypto.randomUUID());
    await verify(await dummyHash, password);
    return false;
  }
  return verify(passwordHash, password);
}
