// Suppression immédiate et définitive d'un compte (F-AUTH-07, RGPD art. 17, ADR-037).
// Une seule transaction : verrou du compte puis des carnets possédés, tâches de fond qui le
// désignent, pseudonymisation du journal d'audit, purge des carnets (`purgeNotebook`), suppression
// du compte (la cascade emporte sessions, jetons, identités, appareils, réglages, adhésions,
// exports), enfin effacement des fichiers d'export chiffrés avant la validation.
import { eq, inArray, or, sql } from 'drizzle-orm';
import type { Tx } from '../auth/session.service.js';
import { auditLog, exportFile, job, notebook, user } from '../db/schema/index.js';
import type { EncryptedFileStore } from '../exports/file-store.js';
import { purgeNotebook } from '../notebooks/purge-notebook.js';

/** `false` si le compte n'existe plus (déjà supprimé : jeton d'accès encore signé). */
export async function deleteAccount(
  tx: Tx,
  userId: string,
  files: EncryptedFileStore | null,
): Promise<boolean> {
  const [account] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .for('update');
  if (!account) return false;

  const owned = (
    await tx
      .select({ id: notebook.id })
      .from(notebook)
      .where(eq(notebook.ownerId, userId))
      .orderBy(notebook.id)
      .for('update')
  ).map((row) => row.id);

  const exportIds = (
    await tx
      .select({ id: exportFile.id })
      .from(exportFile)
      .where(
        owned.length > 0
          ? or(eq(exportFile.userId, userId), inArray(exportFile.notebookId, owned))
          : eq(exportFile.userId, userId),
      )
  ).map((row) => row.id);

  await deleteJobsMentioning(tx, [userId, ...owned, ...exportIds]);

  // La trace des accès administrateurs survit (NF-SEC-06), sans désigner la personne.
  await tx.update(auditLog).set({ actorUserId: null }).where(eq(auditLog.actorUserId, userId));
  await tx
    .update(auditLog)
    .set({ targetId: null })
    .where(inArray(auditLog.targetId, [userId, ...owned, ...exportIds]));

  // Partage hors MVP : un carnet possédé est purgé en entier. TODO(F-PAR) : transfert de propriété
  // ou refus 409 quand un carnet aura d'autres membres (ADR-037).
  for (const notebookId of owned) await purgeNotebook(tx, notebookId);
  await tx.delete(user).where(eq(user.id, userId));

  // Avant la validation : en cas d'échec, la transaction est annulée mais les fichiers sont déjà
  // illisibles, ce qui ne laisse jamais de donnée personnelle sans ligne pour la retrouver.
  if (files) for (const id of exportIds) await files.remove(id);
  return true;
}

/**
 * Tâches dont la charge utile ou la clé d'unicité cite le compte, l'un de ses carnets ou de ses
 * exports. Toute charge utile de notification d'un carnet porte `notebookId` (ADR-030, 033, 034) ;
 * un report `deferred:<tâche>` recopie la charge utile d'origine. Table courte (purge à 7 jours).
 */
async function deleteJobsMentioning(tx: Tx, mentioned: string[]): Promise<void> {
  const mentions = mentioned.flatMap((id) => [
    sql`instr(${job.payload}, ${id}) > 0`,
    sql`instr(coalesce(${job.uniqueKey}, ''), ${id}) > 0`,
  ]);
  // Lecture sans verrou puis suppression par clé : un DELETE à balayage attendrait les insertions
  // de tâches non validées des autres transactions en tenant les verrous du compte.
  const ids = (
    await tx
      .select({ id: job.id })
      .from(job)
      .where(or(...mentions))
  ).map((r) => r.id);
  if (ids.length > 0) await tx.delete(job).where(inArray(job.id, ids));
}
