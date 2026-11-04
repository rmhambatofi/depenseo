# DECISIONS — journal des décisions d'architecture (ADR)

Format : une entrée par décision, 5 à 10 lignes. Ajoute une entrée dès que tu tranches une ambiguïté du cahier des charges ou que tu t'écartes d'une recommandation.

## ADR-001 — Vérification des reçus store : directe, sans RevenueCat (2026-11-04)

Contexte : §8.1 laisse le choix entre vérification directe et RevenueCat (sous-traitant hors UE).
Décision : vérification directe derrière une interface `StoreReceiptVerifier` ; RevenueCat reste possible plus tard via un adaptateur.
Conséquence : moins de dépendance RGPD, un peu plus de code (App Store Server API + Google Play Developer API).

## ADR-002 — Dates calendaires en `string` + `Temporal.PlainDate` via polyfill `temporal-polyfill` (2026-11-04)

Contexte : NF-FMT-08 autorise chaîne ou Temporal.
Décision : type `CalendarDate = string & { __brand }` aux frontières (API, base, JSON), `Temporal.PlainDate` pour tout calcul dans `packages/shared`.
Conséquence : aucune occurrence de `new Date(` sur une date calendaire ; règle ESLint `no-restricted-syntax` ajoutée.
