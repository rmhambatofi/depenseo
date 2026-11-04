// Transactions avec nouvelle tentative sur interblocage (1213) et attente de verrou dépassée (1205), §8.2.
// L'isolation READ COMMITTED est réglée sur la connexion (connection.ts), pas ici.

export const ER_LOCK_WAIT_TIMEOUT = 1205;
export const ER_LOCK_DEADLOCK = 1213;
const RETRYABLE = new Set<number>([ER_LOCK_WAIT_TIMEOUT, ER_LOCK_DEADLOCK]);

export interface Transactional<Tx> {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export interface RetryOptions {
  /** Tentatives au total, première comprise. */
  maxAttempts?: number;
  /** Délai de base en ms, doublé à chaque nouvelle tentative, plus une gigue aléatoire. */
  baseDelayMs?: number;
  /** Appelé avant chaque nouvelle tentative (numéro de la tentative échouée, code MySQL). */
  onRetry?: (attempt: number, errno: number) => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/** Code MySQL d'erreur de verrou rejouable, en suivant la chaîne `cause` (Drizzle enveloppe l'erreur du pilote). */
function retryableErrno(error: unknown): number | undefined {
  for (let current = error, depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const errno = (current as { errno?: unknown }).errno;
    if (typeof errno === 'number' && RETRYABLE.has(errno)) return errno;
    current = current.cause;
  }
  return undefined;
}

export function isRetryableLockError(error: unknown): boolean {
  return retryableErrno(error) !== undefined;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exécute `fn` dans une transaction et la rejoue entièrement si elle échoue sur un verrou.
 * `fn` doit donc être rejouable : pas d'effet de bord hors base (e-mails : file `job`, P1-04).
 * À appeler sur le client racine, jamais sur un `tx` : après un 1213, InnoDB a annulé toute la
 * transaction, rejouer un point de sauvegarde serait faux. `fn` ne doit pas intercepter une erreur
 * de verrou pour continuer : les requêtes suivantes partiraient hors transaction.
 */
export async function withTransaction<Tx, T>(
  db: Transactional<Tx>,
  fn: (tx: Tx) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 5,
    baseDelayMs = 20,
    onRetry,
    sleep = defaultSleep,
    random = Math.random,
  } = options;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.transaction(fn);
    } catch (error) {
      const errno = retryableErrno(error);
      if (errno === undefined || attempt >= maxAttempts) throw error;
      await onRetry?.(attempt, errno);
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      await sleep(backoff + Math.floor(random() * backoff));
    }
  }
}
