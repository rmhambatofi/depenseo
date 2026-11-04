import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/env.js';
import { TEST_ENV } from './support/app.js';

describe('loadConfig', () => {
  it('applique les valeurs par défaut', () => {
    expect(loadConfig(TEST_ENV)).toMatchObject({ NODE_ENV: 'test', PORT: 3000, LOG_LEVEL: 'info' });
  });

  it('refuse de démarrer si un secret manque, sans afficher de valeur', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('refuse un secret trop court et n’écrit jamais sa valeur dans le message', () => {
    let message = '';
    try {
      loadConfig({ ...TEST_ENV, JWT_ACCESS_SECRET: 'court-et-secret' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/JWT_ACCESS_SECRET/);
    expect(message).not.toContain('court-et-secret');
  });

  it('refuse un port ou un niveau de journal invalide', () => {
    expect(() => loadConfig({ ...TEST_ENV, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...TEST_ENV, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});
