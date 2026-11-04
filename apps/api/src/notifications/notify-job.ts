// Tâche `notify` (F-NOT-01) : une notification à envoyer, créée dans la transaction de l'écriture
// qui la déclenche. La charge utile ne porte que des identifiants et des seuils, jamais de montant
// (ADR-003). Gestionnaire d'envoi push : P4-04.
import { z } from 'zod';
import { defineJob } from '../jobs/job-queue.js';

/** Premier seuil d'alerte de limite, puis 100 % et chaque tranche de `ALERT_STEP` points (ADR-004). */
export const FIRST_ALERT_PERCENT = 80;
export const ALERT_STEP = 10;
/** Dernier seuil notifié (ADR-029) : au-delà, plus d'alerte dans la période (au plus 12). */
export const MAX_ALERT_PERCENT = 200;

/** Union discriminée par `kind` : limite (P3-03), dépense inhabituelle (P3-04), échéances (P4). */
export const NOTIFY = defineJob(
  'notify',
  z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('limit'),
      notebookId: z.uuid(),
      periodStart: z.iso.date(),
      threshold: z.number().int().min(FIRST_ALERT_PERCENT).max(MAX_ALERT_PERCENT),
    }),
    z.strictObject({
      kind: z.literal('unusual_expense'),
      notebookId: z.uuid(),
      expenseId: z.uuid(),
    }),
  ]),
);
