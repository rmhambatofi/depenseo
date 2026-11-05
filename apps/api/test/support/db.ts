// Accès à la base de test (MariaDB 10.6 du docker-compose, ADR-010).
// Compte API (DML seul) pour le code testé ; compte migrator pour préparer et nettoyer.
import mysql from 'mysql2/promise';

const DEFAULT_TEST_DATABASE_URL =
  'mysql://depenseo_api:depenseo_api_dev@127.0.0.1:3307/depenseo_test';
const DEFAULT_MIGRATOR_URL =
  'mysql://depenseo_migrator:depenseo_migrator_dev@127.0.0.1:3307/depenseo_test';

/** Base vide de restauration (P4-08) : compte migrator, vidée par la suite qui l'utilise. */
const DEFAULT_RESTORE_URL =
  'mysql://depenseo_migrator:depenseo_migrator_dev@127.0.0.1:3307/depenseo_restore_test';
export const TEST_RESTORE_URL = process.env.TEST_RESTORE_URL ?? DEFAULT_RESTORE_URL;
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
export const TEST_MIGRATOR_URL = process.env.TEST_MIGRATOR_URL ?? DEFAULT_MIGRATOR_URL;

/** Connexion d'administration du schéma de test (DDL), sans le réglage de session de l'API. */
export function migratorConnection(): Promise<mysql.Connection> {
  return mysql.createConnection(TEST_MIGRATOR_URL);
}
