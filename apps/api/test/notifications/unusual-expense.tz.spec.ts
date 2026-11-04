// Fenêtre de 90 jours de la dépense inhabituelle (ADR-030, NF-FMT-05) : indépendante du fuseau du
// processus, y compris autour des changements d'heure et du 29 février (suite `test:tz`).
import { describe, expect, it } from 'vitest';
import { historyStart } from '../../src/expenses/unusual-expense.js';

describe(`historyStart (TZ=${process.env.TZ ?? 'non défini'})`, () => {
  it.each([
    ['2026-09-10', '2026-06-12'],
    ['2026-06-27', '2026-03-29'], // J−90 = passage à l'heure d'été en Europe
    ['2026-06-06', '2026-03-08'], // J−90 = passage à l'heure d'été en Amérique du Nord
    ['2027-01-23', '2026-10-25'], // J−90 = retour à l'heure d'hiver en Europe
    ['2028-05-29', '2028-02-29'], // année bissextile
    ['2027-03-31', '2026-12-31'], // changement d'année
  ])('%s → %s', (spentOn, expected) => {
    expect(historyStart(spentOn)).toBe(expected);
  });
});
