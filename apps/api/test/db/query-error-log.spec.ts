// Drizzle met la requête et ses paramètres dans le message de DrizzleQueryError (sur deux lignes) :
// le journal ne doit en garder aucune ligne (NF-SEC, ADR-013).
import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { describeError } from '../../src/logging/redact.js';

describe('journal d’une erreur de requête Drizzle', () => {
  it('ne contient ni la requête ni les paramètres', () => {
    const cause = Object.assign(new Error("Duplicate entry 'alice@example.fr'"), { errno: 1062 });
    const error = new DrizzleQueryError(
      'insert into `user` (`email`, `amount`) values (?, ?)',
      ['alice@example.fr', 123456],
      cause,
    );
    const logged = JSON.stringify(describeError(error));
    expect(logged).not.toContain('alice@example.fr');
    expect(logged).not.toContain('123456');
    expect(logged).not.toContain('insert into');
    expect(logged).toContain('"stack"');
  });

  it('ne laisse pas passer un paramètre qui imite une ligne de pile, et garde le code du pilote', () => {
    const cause = Object.assign(new Error('Deadlock found'), {
      errno: 1213,
      code: 'ER_LOCK_DEADLOCK',
    });
    const error = new DrizzleQueryError(
      'update expense set note = ?',
      ['x\n    at bob@example.fr (note)'],
      cause,
    );
    const described = describeError(error);
    expect(JSON.stringify(described)).not.toContain('bob@example.fr');
    expect(described).toMatchObject({ code: 'ER_LOCK_DEADLOCK', errno: 1213 });
    expect(described.stack).toMatch(/^\s+at /);
  });
});
