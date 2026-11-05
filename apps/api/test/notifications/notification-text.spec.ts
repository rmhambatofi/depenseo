// Textes des notifications (F-NOT-01, F-NOT-05, ADR-003) : fr/en, aucun montant, aucun libellé
// saisi par l'utilisateur ; données d'ouverture limitées au type et aux identifiants.
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { notificationMessage } from '../../src/notifications/notification-text.js';
import type { NOTIFY } from '../../src/notifications/notify-job.js';

type Payload = z.infer<typeof NOTIFY.payload>;
const NB = '0190f3a0-0000-7000-8000-000000000001';
const ID = '0190f3a0-0000-7000-8000-000000000002';

const PAYLOADS: Payload[] = [
  { kind: 'limit', notebookId: NB, periodStart: '2026-11-01', threshold: 80 },
  { kind: 'limit', notebookId: NB, periodStart: '2026-11-01', threshold: 100 },
  { kind: 'limit', notebookId: NB, periodStart: '2026-11-01', threshold: 150 },
  { kind: 'unusual_expense', notebookId: NB, expenseId: ID },
  { kind: 'occurrence_due', notebookId: NB, occurrenceId: ID },
  { kind: 'occurrence_reminder', notebookId: NB, occurrenceId: ID, reminder: 'three_days_before' },
  { kind: 'occurrence_reminder', notebookId: NB, occurrenceId: ID, reminder: 'due_date' },
  { kind: 'daily_reminder', userId: ID, date: '2026-11-05' },
];

/** Symboles et codes monétaires, montants décimaux. */
const MONEY = /[€$£¥₹]|\b(EUR|USD|GBP|CHF|CAD)\b|\d+[.,]\d{2}\b/;

describe('notificationMessage', () => {
  it.each(['fr', 'en'] as const)('%s : titre et corps non vides, aucun montant', (language) => {
    for (const payload of PAYLOADS) {
      const message = notificationMessage(payload, language);
      expect(message.title.length).toBeGreaterThan(0);
      expect(message.body.length).toBeGreaterThan(0);
      const text = JSON.stringify(message);
      expect(text).not.toMatch(MONEY);
      // Seul chiffre admis dans les textes : le seuil en pourcentage d'une alerte de limite.
      const digits = `${message.title} ${message.body}`.match(/\d+/g) ?? [];
      expect(digits).toEqual(payload.kind === 'limit' ? [String(payload.threshold)] : []);
    }
  });

  it('textes distincts en français et en anglais', () => {
    for (const payload of PAYLOADS) {
      expect(notificationMessage(payload, 'fr').body).not.toBe(
        notificationMessage(payload, 'en').body,
      );
    }
  });

  it('langue inconnue → français', () => {
    expect(notificationMessage(PAYLOADS[3]!, 'de')).toEqual(
      notificationMessage(PAYLOADS[3]!, 'fr'),
    );
  });

  it('données d’ouverture : type et identifiants seulement', () => {
    expect(notificationMessage(PAYLOADS[0]!, 'fr').data).toEqual({
      kind: 'limit',
      notebookId: NB,
      periodStart: '2026-11-01',
    });
    expect(notificationMessage(PAYLOADS[5]!, 'en').data).toEqual({
      kind: 'occurrence_reminder',
      notebookId: NB,
      occurrenceId: ID,
    });
    expect(notificationMessage(PAYLOADS[7]!, 'fr').data).toEqual({
      kind: 'daily_reminder',
      date: '2026-11-05',
    });
  });

  it('seuil ≥ 100 % : dépassement annoncé', () => {
    expect(notificationMessage(PAYLOADS[1]!, 'fr').body).toContain('100\u202f%');
    expect(notificationMessage(PAYLOADS[2]!, 'en').body).toContain('150%');
  });
});
