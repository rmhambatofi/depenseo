// Pool mysql2 et client Drizzle (§8.2, NF-FMT-02/03/07, ADR-014).
// Chaque connexion physique est réglée à son ouverture, avant toute requête applicative :
// mysql2 exécute les requêtes d'une connexion dans l'ordre de leur envoi.
import { Logger } from '@nestjs/common';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql, { type Pool, type PoolOptions } from 'mysql2';
import type { AppConfig } from '../config/env.js';

export type DbConfig = Pick<AppConfig, 'DATABASE_URL' | 'DB_POOL_SIZE'>;
export type Database = MySql2Database;

/** Requêtes de session, une par instruction (pas de `multipleStatements`). SQL commun MySQL 8 / MariaDB 10.6. */
export const SESSION_INIT_SQL = [
  "SET time_zone = '+00:00'",
  'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED',
] as const;

export function poolOptions(config: DbConfig): PoolOptions {
  const url = new URL(config.DATABASE_URL);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    // Collation négociée à la poignée de main : utf8mb4_unicode_520_ci (NF-FMT-01).
    charset: 'UTF8MB4_UNICODE_520_CI',
    // DATE en chaîne AAAA-MM-JJ, jamais en objet Date (NF-FMT-07) ; DATETIME lus comme de l'UTC.
    dateStrings: ['DATE'],
    timezone: 'Z',
    // BIGINT (centimes) : chaîne si hors des entiers sûrs, jamais arrondi silencieusement.
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: false,
    connectionLimit: config.DB_POOL_SIZE,
    // Mutualisé : on ne garde qu'une connexion inactive ; les autres ferment après 60 s
    // (mysql2 n'active ce nettoyage que si maxIdle < connectionLimit).
    maxIdle: 1,
    idleTimeout: 60_000,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
  };
}

export interface PoolHooks {
  /** Requêtes de réglage (tests : forcer un échec). */
  sessionInit?: readonly string[];
  /** Échec d'un réglage : codes seuls, jamais le message du serveur. */
  onSessionError?: (error: { code?: string; errno?: number }) => void;
}

const logger = new Logger('Database');

/**
 * Pool à rappels : l'événement `connection` y livre la connexion brute à régler avant que le pool
 * ne la rende. Si un réglage échoue, la connexion est détruite : les requêtes déjà en file sont
 * rejetées au lieu de s'exécuter sur une session mal réglée.
 */
export function createDbPool(config: DbConfig, hooks: PoolHooks = {}): Pool {
  const {
    sessionInit = SESSION_INIT_SQL,
    onSessionError = ({ code, errno }) =>
      logger.error({ code, errno }, 'database session initialisation failed'),
  } = hooks;
  const pool = mysql.createPool(poolOptions(config));
  pool.on('connection', (connection) => {
    for (const statement of sessionInit) {
      connection.query(statement, (error) => {
        if (!error) return;
        onSessionError({ code: error.code, errno: error.errno });
        connection.destroy();
      });
    }
  });
  return pool;
}

export function createDatabase(pool: Pool): Database {
  // Forme positionnelle : drizzle-orm 0.45.4 prend un objet `{ client, mode }` pour le client lui-même.
  return drizzle(pool);
}
