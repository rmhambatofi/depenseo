// Règles de droits (F-ABO-01/02, ADR-040) : abonnement actif non échu > essai en cours > gratuit.
import { describe, expect, it } from 'vitest';
import { canExportExcel, resolveEntitlements } from '../../src/subscriptions/entitlements.js';

const now = new Date('2027-08-10T10:00:00Z');
const later = new Date('2027-09-10T10:00:00Z');
const latest = new Date('2028-08-10T10:00:00Z');
const past = new Date('2027-08-01T00:00:00Z');

describe('resolveEntitlements', () => {
  it('sans abonnement ni essai : gratuit, essai disponible', () => {
    expect(resolveEntitlements([], null, now)).toEqual({
      plan: 'free',
      premiumUntil: null,
      trialEndsAt: null,
      trialAvailable: true,
    });
  });

  it('abonnement actif : Premium jusqu’à l’échéance la plus tardive', () => {
    const state = resolveEntitlements(
      [
        { status: 'active', expiresAt: later },
        { status: 'active', expiresAt: latest },
      ],
      null,
      now,
    );
    expect(state).toMatchObject({ plan: 'premium', premiumUntil: latest, trialAvailable: true });
  });

  it('abonnement prioritaire sur l’essai en cours', () => {
    const state = resolveEntitlements([{ status: 'active', expiresAt: latest }], later, now);
    expect(state).toEqual({
      plan: 'premium',
      premiumUntil: latest,
      trialEndsAt: later,
      trialAvailable: false,
    });
  });

  it.each(['suspended', 'expired', 'revoked'] as const)('abonnement %s : aucun droit', (status) => {
    expect(resolveEntitlements([{ status, expiresAt: latest }], null, now).plan).toBe('free');
  });

  it('abonnement actif échu (échéance = maintenant) : aucun droit', () => {
    expect(resolveEntitlements([{ status: 'active', expiresAt: now }], null, now).plan).toBe(
      'free',
    );
  });

  it('essai : actif avant sa fin, terminé à sa fin exacte', () => {
    expect(resolveEntitlements([], later, now)).toMatchObject({
      plan: 'trial',
      premiumUntil: later,
    });
    expect(resolveEntitlements([], now, now)).toMatchObject({ plan: 'free', premiumUntil: null });
    expect(resolveEntitlements([], past, now).trialAvailable).toBe(false);
  });

  it('export Excel : Premium et essai seulement', () => {
    expect(canExportExcel(resolveEntitlements([], null, now))).toBe(false);
    expect(canExportExcel(resolveEntitlements([], later, now))).toBe(true);
    expect(
      canExportExcel(resolveEntitlements([{ status: 'active', expiresAt: later }], null, now)),
    ).toBe(true);
  });
});
