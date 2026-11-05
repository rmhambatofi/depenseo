// Textes des notifications push en français et en anglais (F-NOT-01, ADR-003, ADR-035). Aucun
// montant ni libellé saisi (catégorie, note) : l'écran verrouillé n'affiche que le type d'événement,
// et le seuil en pourcentage pour une limite. Les données d'ouverture ne portent que des
// identifiants.
import type { z } from 'zod';
import type { NOTIFY } from './notify-job.js';
import type { PushMessage } from './push-sender.js';

type Payload = z.infer<typeof NOTIFY.payload>;
type Text = { title: string; body: string };

const NNBSP = ' ';

function frText(p: Payload): Text {
  switch (p.kind) {
    case 'limit':
      return p.threshold >= 100
        ? {
            title: 'Limite dépassée',
            body: `Vos dépenses atteignent ${p.threshold}${NNBSP}% de votre limite pour cette période.`,
          }
        : {
            title: 'Limite bientôt atteinte',
            body: `Vous avez utilisé ${p.threshold}${NNBSP}% de votre limite pour cette période.`,
          };
    case 'unusual_expense':
      return {
        title: 'Dépense inhabituelle',
        body: 'Une dépense nettement plus élevée que d’habitude vient d’être enregistrée.',
      };
    case 'occurrence_due':
      return {
        title: 'Échéance à confirmer',
        body: 'Une dépense récurrente arrive à échéance : confirmez-la, ajustez-la ou sautez-la.',
      };
    case 'occurrence_reminder':
      return p.reminder === 'due_date'
        ? { title: 'Échéance aujourd’hui', body: 'Une dépense récurrente est prévue aujourd’hui.' }
        : {
            title: 'Échéance prochaine',
            body: 'Une dépense récurrente est prévue dans trois jours.',
          };
    case 'daily_reminder':
      return { title: 'Depenseo', body: 'Avez-vous noté vos dépenses du jour ?' };
  }
}

function enText(p: Payload): Text {
  switch (p.kind) {
    case 'limit':
      return p.threshold >= 100
        ? {
            title: 'Limit exceeded',
            body: `Your spending has reached ${p.threshold}% of your limit for this period.`,
          }
        : {
            title: 'Limit almost reached',
            body: `You have used ${p.threshold}% of your limit for this period.`,
          };
    case 'unusual_expense':
      return {
        title: 'Unusual expense',
        body: 'An expense much higher than usual has just been recorded.',
      };
    case 'occurrence_due':
      return {
        title: 'Payment to confirm',
        body: 'A recurring expense is due: confirm, adjust or skip it.',
      };
    case 'occurrence_reminder':
      return p.reminder === 'due_date'
        ? { title: 'Due today', body: 'A recurring expense is due today.' }
        : { title: 'Coming up', body: 'A recurring expense is due in three days.' };
    case 'daily_reminder':
      return { title: 'Depenseo', body: 'Have you recorded today’s expenses?' };
  }
}

/** Données d'ouverture : type et identifiants utiles à la navigation de l'application. */
function openData(p: Payload): Record<string, string> {
  switch (p.kind) {
    case 'limit':
      return { kind: p.kind, notebookId: p.notebookId, periodStart: p.periodStart };
    case 'unusual_expense':
      return { kind: p.kind, notebookId: p.notebookId, expenseId: p.expenseId };
    case 'occurrence_due':
    case 'occurrence_reminder':
      return { kind: p.kind, notebookId: p.notebookId, occurrenceId: p.occurrenceId };
    case 'daily_reminder':
      return { kind: p.kind, date: p.date };
  }
}

/** Message d'une tâche `notify` dans la langue du compte (`en`, sinon français). */
export function notificationMessage(payload: Payload, language: string): PushMessage {
  const text = language === 'en' ? enText(payload) : frText(payload);
  return { ...text, data: openData(payload) };
}
