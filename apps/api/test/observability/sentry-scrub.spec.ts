// Suivi des erreurs Sentry (NF-QUA-02, NF-SEC-06, ADR-064) : aucun montant ni donnée personnelle
// ne quitte l'API, quel que soit le champ de l'événement qui les porte.
import type { ArgumentsHost } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';
import { ProblemDetailsFilter } from '../../src/errors/problem-details.filter.js';
import { ProblemException } from '../../src/errors/problem.exception.js';
import { initSentry, scrubBreadcrumb, scrubEvent } from '../../src/observability/sentry.js';
import { TEST_ENV } from '../support/app.js';

const EU_DSN =
  'https://0123456789abcdef0123456789abcdef@o123456.ingest.de.sentry.io/4500000000000001';
const SECRETS = [
  '98765',
  '987,65',
  'alice@example.fr',
  'Boulangerie Martin',
  'Bearer abc.def',
  '203.0.113.7',
];

function expectClean(value: unknown): void {
  const text = JSON.stringify(value);
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

function dirtyEvent(): ErrorEvent {
  return {
    type: undefined,
    message: 'Dépense de 987,65 € refusée pour alice@example.fr',
    logentry: { message: 'amount %s', params: ['98765'] },
    exception: {
      values: [
        {
          type: 'QueryFailedError',
          value: "Duplicate entry 'alice@example.fr' (amount_cents=98765)",
          stacktrace: {
            frames: [
              {
                filename: '/app/dist/src/expenses/service.js',
                function: 'create',
                lineno: 42,
                vars: { amountCents: 98765, merchant: 'Boulangerie Martin' },
                context_line: "const label = 'Boulangerie Martin';",
                pre_context: ['// 98765'],
                post_context: ['// 987,65'],
              },
            ],
          },
        },
      ],
    },
    request: {
      method: 'POST',
      url: 'https://depenseo.fr/api/v1/notebooks/n1/expenses?amount=98765&email=alice@example.fr',
      query_string: 'amount=98765',
      data: { amountCents: 98765, merchant: 'Boulangerie Martin' },
      cookies: { session: 'Bearer abc.def' },
      headers: {
        authorization: 'Bearer abc.def',
        'x-forwarded-for': '203.0.113.7',
        'content-type': 'application/json',
      },
      env: { REMOTE_ADDR: '203.0.113.7' },
    },
    user: { id: 'u1', email: 'alice@example.fr', ip_address: '203.0.113.7', username: 'alice' },
    extra: {
      amountCents: 98765,
      note: 'Boulangerie Martin',
      nested: { merchant: 'Boulangerie Martin' },
    },
    contexts: { expense: { amount: 98765 }, runtime: { name: 'node', version: 'v22.12.0' } },
    tags: { route: '/expenses', email: 'alice@example.fr' },
    breadcrumbs: [
      { category: 'console', message: 'saved 98765 for alice@example.fr', data: { amount: 98765 } },
      {
        category: 'http',
        data: { url: 'https://depenseo.fr/api/v1/x?email=alice@example.fr', status_code: 500 },
      },
    ],
  };
}

describe('scrubEvent', () => {
  it('nettoie un événement contenant un montant, un e-mail, un commerçant et des secrets', () => {
    const scrubbed = scrubEvent(dirtyEvent());
    expect(scrubbed).not.toBeNull();
    expectClean(scrubbed);
  });

  it('garde ce qui sert au diagnostic : type, pile sans variables, méthode, chemin, statut', () => {
    const scrubbed = scrubEvent(dirtyEvent());
    const exception = scrubbed.exception?.values?.[0];
    expect(exception?.type).toBe('QueryFailedError');
    expect(exception?.value).toBeUndefined();
    expect(exception?.stacktrace?.frames?.[0]).toEqual({
      filename: '/app/dist/src/expenses/service.js',
      function: 'create',
      lineno: 42,
    });
    expect(scrubbed.request).toEqual({
      method: 'POST',
      url: 'https://depenseo.fr/api/v1/notebooks/n1/expenses',
      headers: { 'content-type': 'application/json' },
    });
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.contexts?.runtime).toEqual({ name: 'node', version: 'v22.12.0' });
    expect(scrubbed.tags).toBeUndefined();
    expect(scrubbed.extra).toBeUndefined();
    expect(Object.keys(scrubbed.contexts ?? {})).toEqual(['runtime']);
    expect(scrubbed.breadcrumbs?.[1]).toEqual({
      category: 'http',
      data: { url: 'https://depenseo.fr/api/v1/x', status_code: 500 },
    });
  });

  it('un fil d’Ariane perd son message et ses données sensibles', () => {
    expectClean(
      scrubBreadcrumb({ category: 'console', message: 'amount 98765', data: { amount: 98765 } }),
    );
  });
});

describe('initSentry', () => {
  afterEach(async () => {
    await Sentry.close();
  });

  it('sans SENTRY_DSN, rien n’est initialisé', () => {
    expect(initSentry(loadConfig(TEST_ENV))).toBe(false);
    expect(Sentry.isInitialized()).toBe(false);
  });

  it('l’événement réellement envoyé est nettoyé par beforeSend', async () => {
    const sent: string[] = [];
    const transport = (options: Parameters<typeof Sentry.createTransport>[0]) =>
      Sentry.createTransport(options, (request) => {
        sent.push(
          typeof request.body === 'string'
            ? request.body
            : Buffer.from(request.body).toString('utf8'),
        );
        return Promise.resolve({ statusCode: 200 });
      });
    const config = loadConfig({ ...TEST_ENV, SENTRY_DSN: EU_DSN });
    expect(initSentry(config, { transport })).toBe(true);

    Sentry.setUser({ email: 'alice@example.fr', ip_address: '203.0.113.7' });
    Sentry.addBreadcrumb({ message: 'amount 98765', data: { merchant: 'Boulangerie Martin' } });
    Sentry.captureException(new Error('Dépense 987,65 € de alice@example.fr'), {
      extra: { amountCents: 98765 },
    });
    await Sentry.flush(2000);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('"type":"Error"');
    expect(sent[0]).toContain('"environment":"test"');
    expectClean(sent[0]);
  });

  it('une erreur chaînée (cause) ou un objet lancé ne laisse partir aucune donnée', async () => {
    const sent: string[] = [];
    const transport = (options: Parameters<typeof Sentry.createTransport>[0]) =>
      Sentry.createTransport(options, (request) => {
        sent.push(
          typeof request.body === 'string'
            ? request.body
            : Buffer.from(request.body).toString('utf8'),
        );
        return Promise.resolve({ statusCode: 200 });
      });
    initSentry(loadConfig({ ...TEST_ENV, SENTRY_DSN: EU_DSN }), { transport });

    const cause = new Error("Duplicate entry 'alice@example.fr' amount 98765");
    Sentry.captureException(new Error('wrapper', { cause }));
    Sentry.captureException({ label: 'Boulangerie Martin', amountCents: 98765 });
    await Sentry.flush(2000);

    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain('"type":"Error"');
    for (const body of sent) {
      expectClean(body);
      expect(body).not.toContain('Boulangerie');
    }
  });
});

describe('configuration SENTRY_DSN', () => {
  it('une valeur vide vaut absence', () => {
    expect(loadConfig({ ...TEST_ENV, SENTRY_DSN: '' }).SENTRY_DSN).toBeUndefined();
  });

  it('accepte un DSN de la région UE', () => {
    expect(loadConfig({ ...TEST_ENV, SENTRY_DSN: EU_DSN }).SENTRY_DSN).toBe(EU_DSN);
  });

  it('refuse un DSN hors région UE (NF-QUA-02 : hébergement dans l’UE)', () => {
    for (const dsn of [
      'https://key@o123456.ingest.sentry.io/1',
      'https://key@o123456.ingest.us.sentry.io/1',
      'https://key@evil.example/de.sentry.io/1',
      'http://key@o1.ingest.de.sentry.io/1',
      'https://key@o1.ingest.de.sentry.io.evil.com/1',
      'https://o1.ingest.de.sentry.io/1',
    ]) {
      expect(() => loadConfig({ ...TEST_ENV, SENTRY_DSN: dsn })).toThrow(ConfigError);
    }
  });
});

describe('ProblemDetailsFilter → Sentry', () => {
  function host(): ArgumentsHost {
    const res = {
      headersSent: false,
      status: () => res,
      type: () => res,
      send: () => res,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/api/v1/x?email=a@b.fr' }),
        getResponse: () => res,
      }),
    } as unknown as ArgumentsHost;
  }

  it('signale les erreurs 5xx inattendues, pas les erreurs client ni les 503 voulues', () => {
    const reported: unknown[] = [];
    const filter = new ProblemDetailsFilter((error) => reported.push(error));
    const boom = new Error('boom');
    filter.catch(boom, host());
    filter.catch(new ProblemException(409, 'conflit'), host());
    filter.catch(new ProblemException(503, 'indisponible'), host());
    expect(reported).toHaveLength(1);
    expect(reported[0]).toBe(boom);
  });
});
