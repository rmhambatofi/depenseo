// Droits Premium (ADR-009) : export Excel réservé au Premium, essai compris. Provisoire : lit la
// colonne `user.plan` ; P5-01 remplacera cette règle par le service `Entitlements` (reçus, essai).
export const PREMIUM_PLANS: readonly string[] = ['premium', 'trial'];

export function canExportExcel(plan: string): boolean {
  return PREMIUM_PLANS.includes(plan);
}
