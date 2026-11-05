// Données fictives pour les environnements de développement et de recette (NF-QUA-03, ADR-066).
// Jamais en production : la base cible doit se nommer `…_dev`, `…_recette` ou `…_test`.
// Comptes `<préfixe>.<n>@example.test` vérifiés, carnet personnel et catégories par défaut comme à
// l'inscription, dépenses manuelles en EUR sur les 90 derniers jours. Rejouable : un compte déjà
// présent est laissé tel quel.
import { Temporal } from 'temporal-polyfill';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { hashPassword } from '../auth/password.js';
import type { Database } from '../db/connection.js';
import { category, expense, user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { newId } from '../db/uuid.js';
import { createPersonalNotebook } from '../notebooks/personal-notebook.js';

export class SeedFakeError extends Error {
  override readonly name = 'SeedFakeError';
}

const ALLOWED_DATABASE = /_(dev|recette|test)$/;
const MAX_ACCOUNTS = 1_000;
/** Assez pour reproduire le volume du banc NF-PERF-02 (10 000 dépenses) sur un seul compte. */
const MAX_EXPENSES = 20_000;
/** Lignes par INSERT : bornée pour rester sous `max_allowed_packet`. */
const INSERT_CHUNK = 1_000;
const DAYS_BACK = 90;
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 15_000;
const MERCHANTS = ['Boulangerie', 'Marché', 'Pharmacie', 'Librairie', null, null] as const;

/** Refuse toute base dont le nom n'est pas celui d'un environnement hors production. */
export function assertSeedTarget(databaseUrl: string): void {
  let name: string;
  try {
    name = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  } catch {
    throw new SeedFakeError('DATABASE_URL invalide.');
  }
  if (!ALLOWED_DATABASE.test(name)) {
    throw new SeedFakeError(
      'Refusé : la base cible doit se nommer …_dev, …_recette ou …_test (jamais la production).',
    );
  }
}

function volume(raw: string | undefined, fallback: number, variable: string, max: number) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || value > max) {
    throw new SeedFakeError(`${variable} doit être un entier entre 1 et ${max}.`);
  }
  return value;
}

export interface SeedFakeConfig {
  databaseUrl: string;
  password: string;
  accounts: number;
  expensesPerAccount: number;
}

export function loadSeedFakeConfig(env: Readonly<Record<string, string | undefined>>) {
  const databaseUrl = env.DATABASE_URL ?? '';
  assertSeedTarget(databaseUrl);
  const password = env.SEED_FAKE_PASSWORD ?? '';
  if (password.length < 12) {
    throw new SeedFakeError('SEED_FAKE_PASSWORD (12 caractères au moins) est requis.');
  }
  return {
    databaseUrl,
    password,
    accounts: volume(env.SEED_FAKE_ACCOUNTS, 3, 'SEED_FAKE_ACCOUNTS', MAX_ACCOUNTS),
    expensesPerAccount: volume(env.SEED_FAKE_EXPENSES, 120, 'SEED_FAKE_EXPENSES', MAX_EXPENSES),
  } satisfies SeedFakeConfig;
}

export interface SeedFakeOptions {
  emailPrefix: string;
  password: string;
  accounts: number;
  expensesPerAccount: number;
  /** Date du jour AAAA-MM-JJ : les dépenses tombent dans les 90 jours qui la précèdent. */
  today: string;
  now: Date;
  /** Générateur dans [0, 1) ; injectable pour des données reproductibles. */
  random: () => number;
}

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)]!;

export async function seedFake(db: Database, options: SeedFakeOptions) {
  const { now, random } = options;
  const today = Temporal.PlainDate.from(options.today);
  const emails = Array.from(
    { length: options.accounts },
    (_, i) => `${options.emailPrefix}.${i + 1}@example.test`,
  );
  const existing = new Set(
    (await db.select({ email: user.email }).from(user).where(inArray(user.email, emails))).map(
      (row) => row.email,
    ),
  );
  const passwordHash = await hashPassword(options.password);
  const created: string[] = [];

  for (const email of emails.filter((e) => !existing.has(e))) {
    await withTransaction(db, async (tx) => {
      const userId = newId();
      await tx.insert(user).values({
        id: userId,
        email,
        passwordHash,
        emailVerifiedAt: now,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const notebookId = await createPersonalNotebook(tx, { userId, language: 'fr', now });
      const subcategories = (
        await tx
          .select({ id: category.id })
          .from(category)
          .where(and(eq(category.notebookId, notebookId), isNotNull(category.parentId)))
      ).map((row) => row.id);
      const rows = Array.from({ length: options.expensesPerAccount }, () => ({
        id: newId(),
        notebookId,
        amount: MIN_AMOUNT + Math.floor(random() * (MAX_AMOUNT - MIN_AMOUNT + 1)),
        currency: 'EUR',
        categoryId: pick(subcategories, random),
        spentOn: today.subtract({ days: Math.floor(random() * DAYS_BACK) }).toString(),
        merchant: pick(MERCHANTS, random),
        source: 'manual' as const,
        createdAt: now,
        updatedAt: now,
      }));
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        await tx.insert(expense).values(rows.slice(i, i + INSERT_CHUNK));
      }
    });
    created.push(email);
  }
  return { created, skipped: emails.filter((e) => existing.has(e)) };
}
