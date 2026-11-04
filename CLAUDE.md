# Depenseo — mémoire projet Claude Code

Application de suivi des dépenses (France → Europe). Pas de revenus, pas de soldes, pas de connexion bancaire.
Source de vérité fonctionnelle : `docs/cahier-des-charges.md` (révision 4). Ne jamais la contredire sans ADR.

## Stack (figée par le cahier des charges §8)

- Monorepo **pnpm workspaces** : `apps/api` (NestJS, Node 22, TS), `apps/admin` (React-admin), `apps/web` (React 19 + Vite, V2 uniquement), `packages/api-client` (généré depuis OpenAPI), `packages/shared` (types/utilitaires dates-montants). App mobile Flutter 3 dans `mobile/`.
- API : NestJS + Drizzle ORM (pilote mysql2), contrat OpenAPI, servie sous `/api/v1`. Exécutée par Passenger chez o2switch : **aucun processus permanent**, tâches de fond via table `job` + script cron.
- Base : MariaDB 10.6 (identique en CI via Docker, `docker-compose.yml`). SQL commun MySQL 8 / MariaDB 10.6. **Jamais SQLite ni autre moteur** pour tester l'API.
- Mobile : Flutter 3, Riverpod, Drift + SQLCipher, fl_chart. Hors ligne d'abord.

## Invariants non négociables (tests obligatoires)

1. **Montants** : entiers en centimes (`BIGINT`), devise ISO 4217 `CHAR(3)`, taux `DECIMAL(18,8)`. Jamais `FLOAT`/`DOUBLE`/`number` flottant pour un montant.
2. **Dates calendaires** (dépense, échéance, début de période) : chaîne `AAAA-MM-JJ`, type SQL `DATE`, jamais converties en UTC. En TS : `string` ou `Temporal.PlainDate`. **Interdit** : `new Date('2026-11-03')`.
3. **Horodatages** : `DATETIME(3)` en UTC. Chaque connexion : `SET time_zone = '+00:00'`, pilote `timezone: 'Z'`, `dateStrings: ['DATE']` (ou `mode: 'string'` Drizzle), isolation `READ COMMITTED`, retry sur erreurs 1213/1205.
4. **Encodage** : `utf8mb4` / `utf8mb4_unicode_520_ci`. Jamais `utf8`.
5. **Identifiants** : UUID v7 générés côté client, `BINARY(16)`. Insert idempotent `INSERT … ON DUPLICATE KEY UPDATE`.
6. **Suppressions logiques** `deleted_at`, colonne `updated_at` + index `(notebook_id, updated_at, id)` sur toute table synchronisée.
7. **Sécurité** : contrôle d'accès serveur sur chaque ressource ; `/admin` et routes admin → **404** sans rôle admin ; aucun montant ni donnée personnelle dans les logs ; secrets uniquement en variables d'environnement.
8. **Calculs** (totaux, limites, projections, périodes) : dans l'API seulement, jamais recalculés côté client web. Semaine = lundi→dimanche. Périodes calculées dans le fuseau de l'utilisateur.
9. **Tests multi-fuseaux** (NF-FMT-05) : Europe/Paris, Europe/Lisbon, America/Montreal, Indian/Reunion + changements d'heure, sur tout calcul de date.

## Commandes

```bash
pnpm install                 # racine
docker compose up -d db      # MariaDB 10.6 locale (port 3307)
pnpm -r typecheck            # tsc sur tous les paquets
pnpm -r lint                 # eslint
pnpm --filter api test       # vitest (unitaires + intégration contre MariaDB)
pnpm --filter api test:tz    # suite multi-fuseaux
pnpm --filter api migrate    # migrations Drizzle
pnpm --filter api openapi    # régénère openapi.json puis packages/api-client
cd mobile && flutter test    # tests Flutter
```

Vérifie `package.json` racine si une commande manque : ne devine pas, lis.

## Règles de travail

- **Explorer → planifier → coder → tester → committer.** Pas de code avant d'avoir lu les fichiers concernés. Pour toute exploration large, délègue à un sous-agent (`Explore`) pour préserver le contexte.
- **TDD sur la logique métier** : écris le test (rouge), implémente (vert), refactore. Couverture cible ≥ 70 % sur `domain/` et `services/`.
- Une tâche = un commit atomique, message en anglais au format `feat(api): … (F-LIM-03)` avec l'ID d'exigence.
- Avant chaque commit : `pnpm -r typecheck && pnpm -r lint && pnpm --filter api test` doivent passer. Pas de `--no-verify`, pas de test désactivé.
- Ne jamais inventer d'API de librairie : vérifie dans `node_modules` ou la doc. Préfère les versions épinglées.
- Fichiers > 400 lignes : découpe. Pas de « god module ».
- Lorsque le cahier des charges est ambigu : choisis l'interprétation la plus simple, consigne-la dans `docs/dev/DECISIONS.md` (ADR) et continue. Ne t'arrête que pour une décision **irréversible** (schéma de paiement, suppression de données).

## Protocole de session (obligatoire)

État persistant = fichiers, jamais le contexte. Chaque session :

1. Lis `docs/dev/PROGRESS.md` (état, tâche courante, blocages) puis la section ouverte de `docs/dev/PLAN.md`. Ne relis pas le cahier des charges en entier : lis uniquement les sections citées par la tâche.
2. Prends **une** tâche `[ ]` de `PLAN.md`, marque-la `[~]`, travaille, teste, committe, marque `[x]`.
3. Après chaque tâche : mets à jour `PROGRESS.md` (3 à 10 lignes : fait, en cours, prochaine étape, pièges rencontrés).
4. Si le contexte devient lourd (plus de ~15 fichiers lus, ou après 3 tâches) : finis la tâche en cours, écris le handoff dans `PROGRESS.md`, crée le fichier `.claude/HANDOFF` et termine la session. La boucle externe relance une session fraîche.
5. Ne termine **jamais** une session avec une tâche `[~]` et un état non committé.
6. Blocage réel (décision humaine irréversible, secret manquant, outil absent) : décris-le dans `PROGRESS.md` sous `## BLOQUÉ`, crée `.claude/BLOCKED` et termine.

## Hors périmètre MVP (ne pas implémenter sans demande)

Version web consultative (V2), partage de carnet, import de relevés, pièces jointes, devises, limites par catégorie, analyses automatiques, widget. Ces exigences « S/C » sont listées dans le backlog de `PLAN.md`.
