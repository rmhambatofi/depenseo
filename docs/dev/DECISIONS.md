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

## ADR-003 — F-NOT-05 sans mode discret : aucune notification ne contient de montant (2026-11-04)

Contexte : F-NOT-05 (M) dépend du « mode discret » F-AUTH-05, qui est S (hors MVP). §8.1 indique « contenu sans montant ».
Décision : au MVP, aucune notification push ne contient de montant, quel que soit le réglage. Le mode discret (F-AUTH-05) reste au backlog.
Conséquence : F-NOT-05 satisfaite trivialement et testée (aucun montant dans les charges utiles). Si F-AUTH-05 arrive en V1, les montants pourront être ajoutés hors mode discret.

## ADR-004 — « Dépassement significatif » = chaque tranche de 10 % au-delà de 100 % (2026-11-04)

Contexte : F-LIM-04 ne définit pas « dépassement significatif ».
Décision : alertes à 80 %, 100 %, puis 110 %, 120 %, … de la limite en vigueur ; une seule alerte par seuil et par période (clé d'unicité `limit:<notebook>:<période>:<seuil>`).
Conséquence : nombre d'alertes borné, idempotence simple ; le pas (10 %) est une constante modifiable.

## ADR-005 — « Dépense inhabituellement élevée » (2026-11-04)

Contexte : F-NOT-01 cite une alerte de dépense inhabituellement élevée sans la définir.
Décision : une dépense est inhabituelle si son montant ≥ 3 × la médiane des dépenses de la même catégorie racine sur les 90 jours précédents, avec au moins 5 dépenses d'historique et un montant ≥ 20 € (2000 centimes).
Conséquence : calcul simple côté API, pas de faux positifs sur un historique vide ; la notification ne contient pas le montant (ADR-003).

## ADR-006 — Node 22 cible, Node local plus récent toléré (2026-11-04)

Contexte : la cible est Node 22 (o2switch, §8.1), le poste de développement a Node 26 et aucun gestionnaire de versions.
Décision : `.nvmrc` = 22, `engines.node` = `>=22`, `@types/node` 22.x épinglé (le typecheck refuse les API absentes de Node 22), CI exécutée en Node 22.
Conséquence : la CI fait foi ; les écarts de comportement d'exécution 22/26 sont détectés en CI.
Contrainte liée : TypeScript épinglé à 6.0.x, car typescript-eslint 8.72 exige `typescript <6.1.0` (TypeScript 7 natif non supporté). Monter TypeScript seulement après avoir vérifié ce peer.

## ADR-007 — Une migration par fonctionnalité plutôt qu'un schéma complet en P1-03 (2026-11-04)

Contexte : le plan initial créait toutes les tables en P1-03 ; §8.2 demande « une migration par changement ».
Décision : P1-03 crée l'outillage et les tables de comptes, d'audit et de file de tâches ; chaque tâche qui introduit une table ajoute sa migration. Le test « invariants de schéma » parcourt toutes les tables présentes, donc couvre automatiquement les suivantes.
Conséquence : tâches plus petites, schéma conçu avec les tests de la fonctionnalité.

## ADR-008 — Exigences non fonctionnelles traitées comme « M » (2026-11-04)

Contexte : §7 ne donne pas de priorité MoSCoW aux exigences NF.
Décision : toutes les NF de §7 sont dans le MVP, sauf le volet navigateur de NF-FMT-05 (la version web est V2). NF-PERF-01 et NF-QUA-02 sont mesurées (banc, Sentry) mais leur valeur de production ne peut être constatée qu'après lancement.
Conséquence : tâches P7-05 et P7-06 ajoutées ; matrice `TRACEABILITY.md` sans ligne vide.

## ADR-009 — Export Excel réservé au Premium, CSV gratuit (2026-11-04)

Contexte : F-EXP-01 (M) cite Excel et CSV ; §5 place l'export Excel dans le Premium.
Décision : les deux formats sont implémentés au MVP ; l'Excel est soumis à `Entitlements` (essai compris).
Conséquence : F-EXP-01 testée sur les deux formats, avec un test de refus 403 hors Premium.
