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

## ADR-010 — Base locale et CI : docker-compose unique, trois comptes, réglages serveur en filet (2026-11-04)

Contexte : §8.2 et NF-QUA-03 imposent MariaDB 10.6, utf8mb4_unicode_520_ci et trois comptes distincts (API, migrations, back-office) sans fixer noms ni variables.
Décision : `docker-compose.yml` (image `mariadb:10.6`, port 3307) crée les bases `depenseo` et `depenseo_test` et les comptes `depenseo_api` / `depenseo_admin` (DML seul) et `depenseo_migrator` (tous droits sur ces bases). Le serveur imite un mutualisé : utf8mb4 et `STRICT_ALL_TABLES`, mais fuseau `SYSTEM` = Europe/Paris et `REPEATABLE-READ` laissés exprès, pour que les tests de P1-02 prouvent que l'API force `+00:00` et READ COMMITTED à chaque connexion. Image épinglée au patch (`mariadb:10.6.28`), port lié à 127.0.0.1. La CI (P0-03) démarre ce même compose puis `scripts/db-wait.sh`, plutôt qu'un service GitHub séparé, pour n'avoir qu'une définition. `scripts/db.test.mjs` fait partie de `pnpm test` : la base doit être démarrée.
Conséquence : mots de passe de développement par défaut (sans apostrophe), surchargeables via `.env` (`.env.example`) ; les tests d'intégration nettoient la base avec le compte de migration.

## ADR-011 — Montants, devises et saisie dans `packages/shared` (2026-11-04)

Contexte : NF-FMT-01/06/08 et F-DEP-02 ne fixent ni signe, ni bornes, ni décimales par devise, ni règles de saisie au-delà de « virgule ou point ».
Décision : `Cents` = entier sûr signé (le signe est une règle métier, pas de type). Les « centimes » sont les unités mineures de la devise ; leur nombre de décimales vient d'une **table ISO 4217 figée** dans `currency.ts` (EUR 2, JPY 0, TND 3, HUF 2), pas d'Intl/ICU dont les données varient selon le moteur (HUF, MGA à 0 dans ICU) et changeraient la valeur stockée. `CurrencyCode` = code présent dans cette table (devises européennes et de la zone francophone ; à étendre par ajout). `formatAmount` passe à `Intl.NumberFormat` une chaîne décimale exacte avec les décimales ISO forcées, sans division flottante. `parseAmountInput` (MVP en euros, 2 décimales) : sans signe, un seul séparateur décimal (`,` ou `.`), au plus 2 décimales, espaces (normale, insécable, fine U+2009, fine insécable) seulement entre groupes de 3 chiffres, saisie > 40 caractères refusée (`too_large`) ; « 1.234,56 » et « 1,234.56 » sont refusés plutôt que devinés ; résultat `{ ok, cents } | { ok: false, error }` sans exception. `CalendarDate` validée sans `Date` (calendrier grégorien, bissextiles, années 1000–9999 comme SQL `DATE`).
Conséquence : « 1.234 » (trois décimales) est refusé et non lu comme 1 234 € ; l'interface devra afficher l'erreur `too_many_decimals`.

## ADR-012 — Périodes de limite : repli fin de mois, semaine ISO, « aujourd'hui » par instant explicite (2026-11-04)

Contexte : F-LIM-02 permet un début de période au jour du mois (ex. le 28) ou au jour de la semaine (lundi par défaut), sans dire ce qui arrive aux jours 29–31 dans les mois plus courts.
Décision : la période mensuelle de début `N` commence chaque mois le jour `min(N, nombre de jours du mois)` et finit la veille du début suivant. Avec `N = 31` : 31 janv.–27 févr., 28 févr.–30 mars, 31 mars–29 avr., 30 avr.–30 mai. Les périodes se touchent toujours, sans trou ni chevauchement. Le jour de début de semaine suit la numérotation ISO (1 = lundi … 7 = dimanche), lundi par défaut. `todayIn(timeZone, instant)` prend un `Temporal.Instant` explicite (horloge injectée, jamais l'heure système) et ne dépend pas du fuseau du processus. Le polyfill `temporal-polyfill` (1.0.7, épinglé) est importé explicitement, même si Node 26 fournit `Temporal`, car la cible reste Node 22.
Conséquence : une période peut durer de 28 à 31 jours. Le fuseau est validé par Temporal (`RangeError` si inconnu).

## ADR-013 — Squelette API : NestJS 12 ESM, pino expurgé, erreurs problem+json, OpenAPI committé (2026-11-04)

Contexte : P1-01 fixe la config par env, le journal expurgé, RFC 7807 et `openapi.json`, sans choisir les bibliothèques, la liste des variables ni la forme exacte des journaux.
Décision : `@depenseo/api` en ESM (NestJS 12.3, `"type": "module"`, NodeNext), versions épinglées. Les tests Vitest s'appuient sur le transformeur de Vite 8 qui émet les métadonnées de décorateurs (`emitDecoratorMetadata` du tsconfig), sans SWC. Configuration validée par zod dans `src/config/env.ts` : `NODE_ENV`, `PORT` (3000), `LOG_LEVEL` (info), `JWT_ACCESS_SECRET` (≥ 32 caractères, obligatoire dès maintenant pour que le refus de démarrer soit réel). Les tâches suivantes ajoutent leurs variables (base en P1-02) dans le même schéma. Le message d'erreur nomme la variable, jamais la valeur. Journal JSON par `nestjs-pino` : la requête est réduite à `id`, `method`, `path` sans chaîne de requête, et la réponse à `statusCode`. Aucun en-tête ni corps n'est journalisé, et `formatters.log` expurge récursivement les clés `amount*`, `*email*`/`mail`, `*password`, `*token*`, `*secret`, `note(s)`, `merchant`, `authorization`, `cookie`, `set-cookie`, `phone*`, `iban`, `display|first|last|full_name` (liste de référence : `SENSITIVE_KEY` dans `redact.ts`). pino `redact` n'est pas utilisé parce qu'il ne sait pas filtrer sur un préfixe de clé. Erreurs : un filtre global renvoie `application/problem+json` (`type: about:blank`, `title` = phrase HTTP, `status`, `instance` = chemin sans requête). `detail` ne figure que pour une `ProblemException` (classe de l'API), jamais pour les autres `HttpException`, car Nest recopie le message de body-parser, qui contient l'entrée reçue. Une erreur inattendue donne un 500 générique et est journalisée réduite à `type`, `code` et pile sans la ligne de message (un message de pilote comme « Duplicate entry 'a@b.fr' » peut porter des données personnelles). `redactDeep` ne descend que dans les objets simples et les tableaux (pino applique `formatters.log` avant les serializers). Pas de CORS, pas d'en-tête `X-Powered-By`, pas d'interface Swagger servie : le contrat est `apps/api/openapi.json`, généré par `pnpm --filter api openapi` (build tsc puis `dist/scripts/openapi.js`), exclu de Prettier et comparé octet à octet par un test. Entrée Passenger : `dist/src/main.js` (voir P7-07). Le postinstall de `@scarf/scarf` (télémétrie apportée par `@nestjs/swagger`) est bloqué par `pnpm.neverBuiltDependencies`.
Conséquence : toute route nouvelle impose de régénérer `openapi.json`, sinon le test échoue. Un message d'erreur en texte libre n'est pas expurgé : ne jamais y interpoler de donnée personnelle.
