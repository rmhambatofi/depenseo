# Sauvegardes et restauration (NF-DISP-01, NF-SEC-01, §8.2, ADR-039)

Objectifs : perte de données maximale **1 h** (RPO), reprise en moins de **4 h** (RTO).

## Dispositif

| Couche                       | Fréquence | Où                                            | Rétention                                    | Responsable          |
| ---------------------------- | --------- | --------------------------------------------- | -------------------------------------------- | -------------------- |
| Export logique chiffré       | horaire   | `BACKUP_DIR` sur l'hébergement o2switch       | `BACKUP_RETENTION_HOURS` (48 h par défaut)   | cron `db:export`     |
| JetBackup o2switch           | quotidien | infrastructure o2switch (inclut `BACKUP_DIR`) | **à confirmer auprès d'o2switch**            | o2switch             |
| Copie hors site (second UE)  | quotidien | second prestataire de stockage UE             | 30 jours (recommandé)                        | exploitation (humain) |

L'export horaire est un fichier `depenseo-AAAAMMJJTHHMMSSZ.sql.gz.enc` (horodatage UTC de l'instantané) : SQL compressé puis chiffré par l'application (AES-256-GCM). Il ne contient aucune donnée en clair ; sans `BACKUP_ENCRYPTION_KEY`, il est illisible.

### Rétention et comptes supprimés (ADR-037)

Un compte supprimé (`DELETE /me`) est effacé immédiatement de la base, mais **subsiste dans les sauvegardes** jusqu'à leur rotation : au plus `BACKUP_RETENTION_HOURS` (48 h) pour les exports horaires sur le serveur, puis la durée de conservation de JetBackup et de la copie hors site (30 jours recommandés). La plus longue de ces durées doit figurer dans la politique de confidentialité. Après une restauration, **rejouer les suppressions de compte** intervenues depuis l'instant de l'export (journal d'audit pseudonymisé, ou liste tenue par l'exploitation) avant de rouvrir le service.

## Installation (o2switch)

1. Générer une clé dédiée (différente de `FILE_ENCRYPTION_KEY`) : `openssl rand -base64 32`.
2. La conserver **hors du serveur** (gestionnaire de mots de passe de l'exploitation, avec la date de mise en service) : sans elle, aucune sauvegarde n'est restaurable après la perte du serveur.
3. Créer `BACKUP_DIR` hors du dossier public (ex. `/home/<compte>/depenseo-backups`, droits 0700).
4. Crontab (cPanel → Tâches cron), variables dans un fichier d'environnement non versionné lisible du seul compte :

   ```cron
   7 * * * * cd ~/depenseo/apps/api && set -a && . ~/.depenseo-backup.env && set +a && node dist/scripts/db-export.js >> ~/logs/db-export.log 2>&1
   ```

   Variables : `DATABASE_URL` (compte API : la lecture suffit), `BACKUP_DIR`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_RETENTION_HOURS` (facultative). Sortie : une ligne JSON (`file`, `bytes`, `tables`, `rows`, `pruned`), jamais de donnée ; code de sortie 1 en cas d'échec.

5. Copie hors site quotidienne de `BACKUP_DIR` (ex. `rclone copy` vers un stockage objet UE) : à mettre en place par l'exploitation. Les fichiers étant déjà chiffrés, le prestataire ne voit aucune donnée.
6. Surveiller l'âge du dernier export (alerte si > 2 h) — à brancher sur la supervision (P7). Un export lancé pendant une migration (DDL concurrent) échoue (code de sortie 1, erreur 1412) : le passage suivant le rattrape ; éviter de déployer à la minute 7.

## Restauration

Durée indicative : quelques minutes pour le volume du MVP ; le RTO de 4 h laisse la marge pour recréer l'hébergement.

1. **Geler les écritures** : mettre l'API en maintenance (arrêter l'application Passenger dans cPanel) et commenter les tâches cron (`jobs:run`, `db:export`).
2. Choisir le fichier : le plus récent de `BACKUP_DIR`, sinon de la copie hors site ou de JetBackup.
3. Créer une base **vide** (cPanel → Bases MySQL), y donner tous les droits au compte migrator. La restauration refuse une base qui contient déjà des tables.
4. Restaurer avec le code de l'application déployée (même version ou postérieure). Les secrets ne passent **jamais** sur la ligne de commande (historique du shell, `ps` sur un mutualisé) : les écrire dans un fichier 0600 éphémère, effacé après usage.

   ```bash
   cd ~/depenseo/apps/api
   umask 077 && nano ~/.depenseo-restore.env   # RESTORE_DATABASE_URL=mysql://<migrator>:<mdp>@localhost:3306/<base_vide>
                                               # BACKUP_ENCRYPTION_KEY=<clé en vigueur à la date de l'export>
   (set -a && . ~/.depenseo-restore.env && set +a && \
     node dist/scripts/db-restore.js ~/depenseo-backups/depenseo-20261105T140700Z.sql.gz.enc)
   shred -u ~/.depenseo-restore.env 2>/dev/null || rm -f ~/.depenseo-restore.env
   ```

   Un fichier tronqué, altéré ou déchiffré avec une autre clé est refusé avant toute écriture. La restauration n'est **pas atomique** (le DDL valide implicitement) : après un échec en cours de chargement, supprimer puis recréer la base vide (étape 3) avant de recommencer.

5. Appliquer les migrations postérieures à l'export : `MIGRATOR_DATABASE_URL=… pnpm --filter api migrate` (la table `__drizzle_migrations` est restaurée avec les données).
6. Rejouer les suppressions de compte postérieures à l'export (voir ci-dessus).
7. Pointer `DATABASE_URL` de l'API et du cron vers la base restaurée (ou renommer), redémarrer l'application, réactiver les crons, vérifier `GET /api/v1/health` et un export manuel.

Secours sans Node : `openssl` ne lit pas le format « DPF1 » directement ; déchiffrer avec la fonction `readBackup` (`src/backup/backup-files.ts`) depuis n'importe quel poste disposant de Node 22, puis charger le SQL obtenu avec `mariadb <base_vide> < export.sql`.

## Rotation de la clé de sauvegarde

1. Générer la nouvelle clé, l'enregistrer hors serveur avec sa date de mise en service.
2. Remplacer `BACKUP_ENCRYPTION_KEY` dans le fichier d'environnement du cron.
3. **Conserver l'ancienne clé** tant qu'existent des sauvegardes chiffrées avec elle (rétention la plus longue : copie hors site, JetBackup), puis la détruire.

## Test de restauration

- Automatisé : `apps/api/test/backup/export-restore.spec.ts` (export → restauration dans la base vide `depenseo_restore_test` → schéma, collation et contenu identiques, valeurs limites comprises). Volume Docker antérieur à P4-08 : créer la base à la main
  `docker compose exec db mariadb -uroot -pdepenseo_root_dev -e "CREATE DATABASE IF NOT EXISTS depenseo_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci; GRANT ALL ON depenseo_restore_test.* TO 'depenseo_migrator'@'%';"`.
- Manuel (§8.2) : restauration réelle sur l'hébergement **avant le lancement**, puis **chaque trimestre** ; noter la date, le fichier utilisé et la durée mesurée ci-dessous.

| Date | Fichier | Durée | Opérateur | Remarques |
| ---- | ------- | ----- | --------- | --------- |
|      |         |       |           |           |
