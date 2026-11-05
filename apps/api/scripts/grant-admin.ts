// `pnpm --filter api admin:grant <email>` / `admin:grant --revoke <email>` : seul moyen d'attribuer
// ou de retirer le rôle administrateur (F-ADM-03, ADR-042). À lancer sur le serveur, par l'humain.
// Variables : DATABASE_URL, ADMIN_TOTP_KEY (la même que l'API).
// L'attribution affiche l'URI otpauth:// du nouveau secret TOTP, à saisir aussitôt dans une
// application d'authentification : elle n'est stockée nulle part en clair et ne sera plus affichée.
import { createDatabase, createDbPool } from '../src/db/connection.js';
import {
  GrantAdminError,
  grantAdmin,
  loadGrantAdminConfig,
  revokeAdmin,
} from '../src/admin/grant-admin.js';
import { ConfigError } from '../src/config/env.js';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const revoke = args[0] === '--revoke';
const email = revoke ? args[1] : args[0];
if (!email || args.length !== (revoke ? 2 : 1)) {
  process.stderr.write('Usage : grant-admin <email> | grant-admin --revoke <email>\n');
  process.exit(2);
}

// Le secret TOTP ne doit finir ni dans un fichier ni dans un journal (redirection, cron, tee).
if (!revoke && !process.stdout.isTTY) {
  process.stderr.write(
    'Refusé : la sortie n’est pas un terminal (le secret TOTP y serait écrit).\n',
  );
  process.exit(2);
}

let exitCode = 0;
try {
  const config = loadGrantAdminConfig(process.env);
  const pool = createDbPool({ DATABASE_URL: config.databaseUrl, DB_POOL_SIZE: 1 });
  try {
    const db = createDatabase(pool);
    if (revoke) {
      const userId = await revokeAdmin(db, email, new Date());
      process.stdout.write(`Rôle administrateur retiré au compte ${userId}.\n`);
    } else {
      const result = await grantAdmin(db, config.totpKey, email, new Date());
      process.stdout.write(
        `Rôle administrateur attribué au compte ${result.userId}.\n` +
          `Enrôlez ce secret TOTP maintenant (il ne sera plus affiché) :\n${result.otpauthUri}\n`,
      );
    }
  } finally {
    await pool.promise().end();
  }
} catch (error) {
  // Jamais le message d'une erreur SQL (requête et paramètres, cf. describeError).
  const known = error instanceof GrantAdminError || error instanceof ConfigError;
  process.stderr.write(`${known ? error.message : 'Échec inattendu (base inaccessible ?)'}\n`);
  exitCode = 1;
}
process.exit(exitCode);
