#!/bin/bash
# Bases et comptes séparés (§8.2) : API et back-office sans droit sur le schéma, migrations seules en DDL.
# Exécuté une seule fois par l'image officielle, à la création du volume.
set -euo pipefail

mariadb -uroot -p"${MARIADB_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS depenseo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci;
CREATE DATABASE IF NOT EXISTS depenseo_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci;

CREATE USER IF NOT EXISTS 'depenseo_api'@'%' IDENTIFIED BY '${DB_API_PASSWORD}';
CREATE USER IF NOT EXISTS 'depenseo_migrator'@'%' IDENTIFIED BY '${DB_MIGRATOR_PASSWORD}';
CREATE USER IF NOT EXISTS 'depenseo_admin'@'%' IDENTIFIED BY '${DB_ADMIN_PASSWORD}';

GRANT SELECT, INSERT, UPDATE, DELETE ON depenseo.* TO 'depenseo_api'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON depenseo_test.* TO 'depenseo_api'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON depenseo.* TO 'depenseo_admin'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON depenseo_test.* TO 'depenseo_admin'@'%';
GRANT ALL PRIVILEGES ON depenseo.* TO 'depenseo_migrator'@'%';
GRANT ALL PRIVILEGES ON depenseo_test.* TO 'depenseo_migrator'@'%';
FLUSH PRIVILEGES;
SQL
