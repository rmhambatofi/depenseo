// Point d'entrée (Passenger / node dist/src/main.js). Refuse de démarrer si la configuration est invalide.
import 'reflect-metadata';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config/env.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await createApp(config);
  await app.listen(config.PORT);
}

main().catch((error: unknown) => {
  // Message de configuration sans valeur de secret ; autres erreurs : nom seul.
  const message =
    error instanceof ConfigError
      ? error.message
      : `Démarrage impossible : ${String((error as Error)?.name)}`;
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
