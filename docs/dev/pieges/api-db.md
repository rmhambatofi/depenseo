# Pièges — API : base de données, Drizzle, migrations

## Base locale et comptes

- Base locale volontairement « hostile » : fuseau SYSTEM = Europe/Paris, REPEATABLE-READ, pas de forçage du charset client. La connexion force `+00:00`, READ COMMITTED et utf8mb4_unicode_520_ci côté mysql2 : ne pas « corriger » le cnf.
- Comptes : `depenseo_api`/`depenseo_admin` (DML seul, pas de TRUNCATE/DDL), `depenseo_migrator` (tout) sur `depenseo` et `depenseo_test` ; mots de passe dev `<compte>_dev` sauf root `depenseo_root_dev`. Nettoyer les tests avec le compte migrator. `depenseo_api` n'a pas le privilège PROCESS (`INNODB_TRX` refusé).
- Image épinglée `mariadb:10.6.28` (version o2switch à relever par l'humain). Base de dev Docker : `depenseo_dev` (ancien volume : commande dans `DEPLOY.md` §1).
- Données fictives (ADR-066) : `pnpm --filter api seed:fake` (après build), garde-fou sur le **nom** de la base (`_dev|_recette|_test`).

## Couche données (ADR-014, ADR-015)

- `src/db/connection.ts` : `createDbPool(config, hooks)` pool **à rappels** mysql2, `createDatabase(pool)` → `drizzle(pool)` positionnel (`drizzle({client, mode})` casse en 0.45.4). `transaction.ts` : `withTransaction(db, fn)` sur le client racine seulement ; `hasErrno(error, ER_DUP_ENTRY)`. `uuid.ts` : `newId`, `uuidToBinary`, `binaryToUuid`, colonne `uuidBinary`. `DatabaseModule` global (jetons `DB`, `DB_POOL`). Config : `DATABASE_URL`, `DB_POOL_SIZE`.
- BIGINT montants : `bigint(…, { mode: 'number' })` + rejet des chaînes. `session.tz.spec.ts` lit `@@session.tx_isolation` (MariaDB ; MySQL 8 : `@@transaction_isolation`).
- `DrizzleQueryError` met requête **et paramètres** dans son message : ne jamais journaliser `error.message` ; `describeError` le retire et remonte `code`/`errno` de la `cause`.
- Un client Drizzle sur le pool ne doit pas servir pendant qu'on tient une connexion dédiée (`GET_LOCK`) : avec `DB_POOL_SIZE=1`, interblocage. Utiliser `drizzle(poolConnection.connection)`.
- mysql2 active `CLIENT_FOUND_ROWS` : `affectedRows` compte les lignes **trouvées** (ODKU sans changement → 1). Ne pas s'en servir pour distinguer insertion et doublon.
- Drizzle `onDuplicateKeyUpdate` émet les affectations dans l'ordre des colonnes de la table, pas de l'objet `set`.
- Expression SQL renvoyant un UUID binaire (`coalesce(parent_id, id)`…) : `sql\`…\`.mapWith(category.id)` (sinon Buffer brut).

## SQL et verrous (MariaDB)

- Ne **jamais** combiner `OR` + `ORDER BY` dans une requête `FOR UPDATE SKIP LOCKED` : MariaDB trie hors index et verrouille toutes les lignes candidates. Vérifier le plan par EXPLAIN (`ref`/`range` sans filesort).
- InnoDB sous READ COMMITTED : un `UPDATE … WHERE user_id = ?` attend le verrou implicite d'une ligne insérée non validée ; la contre-épreuve d'un `FOR UPDATE` de défense en profondeur ne mord donc pas (ADR-019).
- MariaDB refuse `NOT NULL` sur une colonne générée : pas de `.notNull()` sur `generatedAlwaysAs`. Pas d'IODKU quand un index unique secondaire doit produire un 409.
- LIKE échappé avec `!` (pas `\`).

## Schéma et migrations

- Schéma `src/db/schema/*.ts` → `pnpm --filter api db:generate` → `apps/api/drizzle/NNNN_*.sql` committé ; appliquer par `runMigrations(url)` / `MIGRATOR_DATABASE_URL=… pnpm --filter api migrate`. Ne jamais modifier une migration appliquée. Horodatages fournis par l'app.
- Pas de colonne JSON (utf8mb4_bin sous MariaDB) ni `binary()` Drizzle (décode en UTF-8 : `sha256Binary`/`uuidBinary`).
- Ne **jamais** passer Prettier sur `apps/api/drizzle/meta` (`npx prettier --write src test` seulement). Un snapshot non suivi laissé par un essai fait croire à drizzle-kit qu'il n'y a rien à générer : le supprimer. Renommer le `.sql` généré **et** le `tag` dans `_journal.json` ; contrôler par `npx drizzle-kit check`.
- Régénérer une migration **non committée** : `rm drizzle/NNNN_*.sql drizzle/meta/NNNN_snapshot.json && git checkout drizzle/meta/_journal.json`, puis `db:generate`, renommer, `drizzle-kit check`.
- drizzle-kit `generate` est **interactif** quand une colonne disparaît et une autre apparaît dans la même table : faire deux migrations (ajout, puis suppression).
- Toute table a une clé primaire `id` (test d'invariants), y compris une table de liaison (`id` + index unique sur le couple). Règles par nom (`*_id`, `*amount*`, `*currency`, `*rate`) : un identifiant externe ne finit pas en `_id`, une colonne non monétaire ne contient pas `amount` (d'où `pricing`).
- FK `expense.category_id` et `expense_tag.tag_id` **sans cascade** : `DELETE notebook` direct → 1451. Suppression physique d'un carnet = `purgeNotebook(tx, id)`. Ne purger une catégorie/étiquette que si non référencée.
- **Toute nouvelle table** : l'ajouter à `populatedAccount` (`test/support/populated-account.ts`), à `SOURCES` de `src/account-export/personal-data.ts` (ou `EXCLUDED_TABLES`), et à `deleteAccount` ; l'ajouter à `notebookRows` du harnais cross-tenant si elle est rattachée à un carnet ; nouvelle colonne secrète texte → `OMITTED_PROPERTIES` + `SECRET_PROPERTIES` du test. Voir `api.md` (export RGPD, suppression de compte).
- **Toute nouvelle vue/déclencheur/routine** casse `test/backup/export-restore.spec.ts` (non exportés).
