// Historique des limites (F-LIM-09, ADR-027) : version en vigueur à une date, calcul pur.
import { describe, expect, it } from 'vitest';
import {
  type LimitVersion,
  versionInForce,
  withAppliesFrom,
} from '../../src/limits/limit-history.js';

type V = LimitVersion & { amount: number | null };
const month = (effectiveDate: string, amount: number | null, startDay = 1): V => ({
  effectiveDate,
  periodKind: 'month',
  startDay,
  amount,
});
const week = (effectiveDate: string, amount: number | null, startDay = 1): V => ({
  effectiveDate,
  periodKind: 'week',
  startDay,
  amount,
});

describe('versionInForce (F-LIM-09)', () => {
  it('changer la limite en cours de mois ne modifie pas la limite des périodes passées', () => {
    const versions = [month('2026-01-10', 50_000), month('2026-03-15', 80_000)];
    expect(versionInForce(versions, '2026-02-28')?.amount).toBe(50_000);
    expect(versionInForce(versions, '2026-01-01')?.amount).toBe(50_000);
    // Le mois de la modification prend la nouvelle limite dès son premier jour.
    expect(versionInForce(versions, '2026-03-01')?.amount).toBe(80_000);
    expect(versionInForce(versions, '2026-04-20')?.amount).toBe(80_000);
  });

  it('aucune version avant la première période couverte', () => {
    expect(versionInForce([month('2026-03-15', 1000)], '2026-02-28')).toBeUndefined();
    expect(versionInForce([], '2026-02-28')).toBeUndefined();
  });

  it('suppression = version sans montant, l’historique antérieur reste', () => {
    const versions = [month('2026-01-05', 1000), month('2026-05-02', null)];
    expect(versionInForce(versions, '2026-04-30')?.amount).toBe(1000);
    expect(versionInForce(versions, '2026-05-01')?.amount).toBeNull();
  });

  const from = (...versions: V[]) => withAppliesFrom(versions).map((v) => v.appliesFrom);

  it('première version : couvre la période qui contient sa date d’effet (jour de début, semaine)', () => {
    // Période du 28 : le 2026-03-10 appartient à la période 28 février → 27 mars.
    expect(from(month('2026-03-10', 1, 28))).toEqual(['2026-02-28']);
    // Jour 31 ramené au 30 avril (ADR-012).
    expect(from(month('2026-05-15', 1, 31))).toEqual(['2026-04-30']);
    // 2026-03-18 est un mercredi : lundi 16 par défaut, dimanche 15 si la semaine part du dimanche.
    expect(from(week('2026-03-18', 1))).toEqual(['2026-03-16']);
    expect(from(week('2026-03-18', 1, 7))).toEqual(['2026-03-15']);
  });

  // Changer le type de période ou le jour de début ne doit jamais faire basculer une période déjà
  // terminée sous la nouvelle limite (F-LIM-09) : la nouvelle version part au plus tôt du début de
  // la période en cours de l'ancienne.
  it.each([
    // [ancienne, nouvelle, premier jour attendu, dernier jour terminé qui garde l'ancienne]
    [
      'mois jour 1 → jour 28',
      month('2026-01-01', 1),
      month('2026-03-10', 2, 28),
      '2026-03-01',
      '2026-02-28',
    ],
    ['semaine → mois', week('2026-01-05', 1), month('2026-03-18', 2), '2026-03-16', '2026-03-15'],
    ['mois → semaine', month('2026-01-01', 1), week('2026-03-18', 2), '2026-03-16', '2026-03-15'],
    [
      'semaine lundi → dimanche',
      week('2026-01-05', 1),
      week('2026-03-18', 2, 7),
      '2026-03-16',
      '2026-03-15',
    ],
  ])('%s : aucune période terminée réécrite', (_label, old, next, first, lastOld) => {
    expect(from(old, next)[1]).toBe(first);
    expect(versionInForce([old, next], lastOld)?.amount).toBe(1);
    expect(versionInForce([old, next], first)?.amount).toBe(2);
  });

  it('règles changées deux fois : la troisième version ne remonte pas avant la deuxième', () => {
    // Semaine dès le lundi 16 mars, puis retour au mois le 20 : les semaines terminées avant le 16
    // restent sous la première version ; la troisième, bornée par la deuxième, part du 16 et la
    // supplante entièrement (sa semaine n'était pas terminée).
    const versions = [month('2026-01-01', 1), week('2026-03-18', 2), month('2026-03-20', 3)];
    expect(from(...versions)).toEqual(['2026-01-01', '2026-03-16', '2026-03-16']);
    expect(versionInForce(versions, '2026-03-15')?.amount).toBe(1);
    expect(versionInForce(versions, '2026-03-16')?.amount).toBe(3);
  });

  it('version précédente tronquée : la suivante ne remonte pas avant son premier jour', () => {
    // Semaine → mois le 18 (premier jour : lundi 16), puis nouveau montant le 20 : sans la borne du
    // premier jour précédent, la troisième version réécrirait les semaines closes du 2 au 15 mars.
    const versions = [week('2026-01-05', 1), month('2026-03-18', 2), month('2026-03-20', 3)];
    expect(from(...versions)).toEqual(['2026-01-05', '2026-03-16', '2026-03-16']);
    expect(versionInForce(versions, '2026-03-15')?.amount).toBe(1);
    expect(versionInForce(versions, '2026-03-16')?.amount).toBe(3);
  });

  it('ordre d’entrée indifférent : la date d’effet la plus récente l’emporte', () => {
    const versions = [month('2026-03-20', 3), month('2026-03-02', 2), month('2026-01-01', 1)];
    expect(versionInForce(versions, '2026-03-25')?.amount).toBe(3);
    expect(versionInForce(versions, '2026-02-25')?.amount).toBe(1);
  });
});
