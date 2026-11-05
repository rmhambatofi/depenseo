// Collecte des données personnelles d'un compte pour l'export RGPD (F-AUTH-08, art. 15 et 20,
// ADR-038) : chaque table qui rattache des lignes au compte, ses carnets compris, lignes supprimées
// logiquement comprises (encore détenues). Secrets et empreintes exclus : ils ne renseignent pas la
// personne et permettraient d'usurper le compte si l'archive fuitait.
import { eq, getTableColumns, getTableName, inArray, type SQL } from 'drizzle-orm';
import type { MySqlColumn, MySqlTable } from 'drizzle-orm/mysql-core';
import type { Database } from '../db/connection.js';
import {
  accountExport,
  auditLog,
  category,
  device,
  emailToken,
  exportFile,
  expense,
  expenseTag,
  limitAlert,
  notebook,
  notebookMember,
  notificationSetting,
  occurrence,
  recurringExpense,
  refreshToken,
  spendingLimit,
  tag,
  user,
  userIdentity,
} from '../db/schema/index.js';

/** Tables volontairement absentes de l'export, avec la raison (vérifié par le test). */
export const EXCLUDED_TABLES: Readonly<Record<string, string>> = {
  job: 'file de tâches technique : identifiants seuls, purgée à 7 jours',
};

/**
 * Propriétés jamais exportées : secrets, empreintes de jetons et d'identifiants externes, jeton
 * push (accréditation de l'appareil), identité de l'administrateur dans le journal d'audit.
 */
export const OMITTED_PROPERTIES: ReadonlySet<string> = new Set([
  'passwordHash',
  'adminTotpSecret',
  'tokenHash',
  'pushToken',
  'pushTokenHash',
  'subjectHash',
  'actorUserId',
]);

export type PlainValue = string | number | boolean | null;
export type PlainRow = Record<string, PlainValue>;
export type PersonalData = Record<string, PlainRow[]>;

interface Scope {
  userId: string;
  notebookIds: string[];
  /** Étiquettes des carnets : `expense_tag` n'a pas de `notebook_id`. */
  tagIds: string[];
  /** Cibles du journal d'audit qui désignent le compte : lui, ses carnets, ses exports. */
  auditTargets: string[];
}

interface Source {
  table: MySqlTable;
  where: (scope: Scope) => SQL | undefined;
}

const byUser = (column: MySqlColumn) => (s: Scope) => eq(column, s.userId);
const byNotebook = (column: MySqlColumn) => (s: Scope) => inArray(column, s.notebookIds);

/** Ordre de l'archive : compte, puis carnets et leur contenu, puis traces. */
const SOURCES: readonly Source[] = [
  { table: user, where: byUser(user.id) },
  { table: userIdentity, where: byUser(userIdentity.userId) },
  { table: notificationSetting, where: byUser(notificationSetting.userId) },
  { table: device, where: byUser(device.userId) },
  { table: refreshToken, where: byUser(refreshToken.userId) },
  { table: emailToken, where: byUser(emailToken.userId) },
  { table: notebook, where: byNotebook(notebook.id) },
  { table: notebookMember, where: byUser(notebookMember.userId) },
  { table: category, where: byNotebook(category.notebookId) },
  { table: tag, where: byNotebook(tag.notebookId) },
  { table: expense, where: byNotebook(expense.notebookId) },
  {
    table: expenseTag,
    where: (s) => inArray(expenseTag.tagId, s.tagIds),
  },
  { table: spendingLimit, where: byNotebook(spendingLimit.notebookId) },
  { table: limitAlert, where: byNotebook(limitAlert.notebookId) },
  { table: recurringExpense, where: byNotebook(recurringExpense.notebookId) },
  { table: occurrence, where: byNotebook(occurrence.notebookId) },
  { table: exportFile, where: byUser(exportFile.userId) },
  { table: accountExport, where: byUser(accountExport.userId) },
  {
    table: auditLog,
    // Accès d'un administrateur aux données du compte. Les actions du compte quand il est
    // lui-même administrateur visent autrui : exclues (données de tiers).
    where: (s) => inArray(auditLog.targetId, s.auditTargets),
  },
];

/** Carnets du compte : possédés ou dont il est membre. */
async function notebookIdsOf(db: Database, userId: string): Promise<string[]> {
  const owned = await db
    .select({ id: notebook.id })
    .from(notebook)
    .where(eq(notebook.ownerId, userId));
  const joined = await db
    .select({ id: notebookMember.notebookId })
    .from(notebookMember)
    .where(eq(notebookMember.userId, userId));
  return [...new Set([...owned, ...joined].map((r) => r.id))].sort();
}

function plain(table: string, row: Record<string, unknown>): PlainRow {
  const out: PlainRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (OMITTED_PROPERTIES.has(key)) continue;
    if (value instanceof Date) out[key] = value.toISOString();
    else if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      out[key] = value as PlainValue;
    } else {
      // Colonne binaire ou structurée non prévue : décider explicitement (exporter ou omettre).
      throw new TypeError(`Valeur non exportable : ${table}.${key}`);
    }
  }
  return out;
}

/** Toutes les données du compte, par nom de table SQL, lignes triées par identifiant. */
export async function collectPersonalData(db: Database, userId: string): Promise<PersonalData> {
  const notebookIds = await notebookIdsOf(db, userId);
  const tags = await db
    .select({ id: tag.id })
    .from(tag)
    .where(inArray(tag.notebookId, notebookIds));
  const exportIds = [
    ...(await db
      .select({ id: exportFile.id })
      .from(exportFile)
      .where(eq(exportFile.userId, userId))),
    ...(await db
      .select({ id: accountExport.id })
      .from(accountExport)
      .where(eq(accountExport.userId, userId))),
  ].map((r) => r.id);
  const scope: Scope = {
    userId,
    notebookIds,
    tagIds: tags.map((t) => t.id),
    auditTargets: [userId, ...notebookIds, ...exportIds],
  };

  const data: PersonalData = {};
  for (const source of SOURCES) {
    const name = getTableName(source.table);
    const columns = getTableColumns(source.table) as Record<string, MySqlColumn>;
    // `inArray` sur une liste vide produit `false` (Drizzle) : aucune ligne.
    const rows = (await db
      .select()
      .from(source.table)
      .where(source.where(scope))
      .orderBy(columns.id!)) as Record<string, unknown>[];
    data[name] = rows.map((row) => plain(name, row));
  }
  return data;
}
