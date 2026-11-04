import type { ArgumentsHost, INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProblemDetailsFilter } from '../src/errors/problem-details.filter.js';
import { redactDeep } from '../src/logging/redact.js';
import { type LogCapture, http, startTestApp } from './support/app.js';

const EMAIL = 'camille.durand@example.fr';
const AMOUNT = '987654';
const TOKEN = 'tok_abcdefghijklmnop';

describe('journal JSON sans données personnelles ni montant (NF-SEC-06)', () => {
  let app: INestApplication;
  let logs: LogCapture;
  beforeAll(async () => ({ app, logs } = await startTestApp()));
  afterAll(() => app.close());

  it('une requête contenant e-mail, montant et jeton n’apparaît pas dans les journaux', async () => {
    await request(http(app))
      .post(`/api/v1/health?email=${encodeURIComponent(EMAIL)}&amountCents=${AMOUNT}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('Cookie', `refresh=${TOKEN}`)
      .send({ email: EMAIL, amountCents: Number(AMOUNT), note: 'loyer', password: 'hunter2' });
    await request(http(app))
      .get(`/api/v1/health?email=${encodeURIComponent(EMAIL)}`)
      .set('Authorization', `Bearer ${TOKEN}`);

    const entries = logs.lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    const completed = entries.filter((e) => e.msg === 'request completed');
    expect(completed.map((e) => e.res)).toEqual([{ statusCode: 404 }, { statusCode: 200 }]);
    expect(completed[1]?.req).toMatchObject({ method: 'GET', path: '/api/v1/health' });
    for (const e of entries) expect(typeof e.level).toBe('number');
    for (const secret of [EMAIL, AMOUNT, TOKEN, 'hunter2', 'loyer', 'camille']) {
      expect(logs.text).not.toContain(secret);
    }
    // le chemin reste utile au diagnostic, sans la chaîne de requête
    expect(logs.text).toContain('"/api/v1/health"');
  });

  it('une erreur 500 est journalisée sans son message (ex. message de pilote SQL)', () => {
    const error = Object.assign(new Error(`Duplicate entry '${EMAIL}' for amount ${AMOUNT}`), {
      code: 'ER_DUP_ENTRY',
    });
    const res = { status: () => res, type: () => res, send: () => res, headersSent: false };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/api/v1/x' }),
        getResponse: () => res,
      }),
    };
    new ProblemDetailsFilter().catch(error, host as unknown as ArgumentsHost);
    const last = JSON.parse(logs.lines.at(-1) ?? '{}') as {
      msg?: string;
      err?: Record<string, unknown>;
    };
    expect(last.msg).toBe('unhandled error');
    expect(last.err).toMatchObject({ type: 'Error', code: 'ER_DUP_ENTRY' });
    expect(String(last.err?.stack)).toMatch(/^ {4}at /);
    expect(logs.text).not.toContain(EMAIL);
    expect(logs.text).not.toContain(AMOUNT);
  });

  it('un objet journalisé par le code applicatif est expurgé', () => {
    app.get(Logger).log(
      {
        user: { email: EMAIL },
        amountCents: 123456,
        limit: { amountMonthly: 50000 },
        merchant: 'Boulangerie',
      },
      'test',
    );
    const last = logs.lines.at(-1) ?? '';
    expect(last).toContain('"test"');
    for (const secret of [EMAIL, '123456', '50000', 'Boulangerie'])
      expect(last).not.toContain(secret);
  });
});

describe('redactDeep', () => {
  it('masque les clés sensibles à toute profondeur, sans muter l’entrée', () => {
    const input = {
      email: EMAIL,
      Amount: 1,
      amountCents: 2,
      password: 'p',
      newPassword: 'p2',
      token: 't',
      refreshToken: 'r',
      note: 'n',
      merchant: 'm',
      headers: { authorization: 'Bearer x', cookie: 'c', 'user-agent': 'ua' },
      items: [{ amountCents: 3, id: 'x' }],
      id: 'keep',
      count: 4,
    };
    const out = redactDeep(input) as typeof input;
    expect(out).toEqual({
      email: '[REDACTED]',
      Amount: '[REDACTED]',
      amountCents: '[REDACTED]',
      password: '[REDACTED]',
      newPassword: '[REDACTED]',
      token: '[REDACTED]',
      refreshToken: '[REDACTED]',
      note: '[REDACTED]',
      merchant: '[REDACTED]',
      headers: { authorization: '[REDACTED]', cookie: '[REDACTED]', 'user-agent': 'ua' },
      items: [{ amountCents: '[REDACTED]', id: 'x' }],
      id: 'keep',
      count: 4,
    });
    expect(input.email).toBe(EMAIL);
  });

  it('couvre les variantes de clés et laisse les instances aux serializers', () => {
    class Opaque {
      email = 'x';
    }
    const opaque = new Opaque();
    const out = redactDeep({ secretKey: 's', phoneNumber: 'p', displayName: 'd', wrapped: opaque });
    expect(out).toEqual({
      secretKey: '[REDACTED]',
      phoneNumber: '[REDACTED]',
      displayName: '[REDACTED]',
      wrapped: opaque,
    });
  });

  it('réduit une erreur à type, code et pile sans message', () => {
    const out = redactDeep({ err: new TypeError(`bad ${EMAIL}`) }) as {
      err: Record<string, unknown>;
    };
    expect(out.err.type).toBe('TypeError');
    expect(JSON.stringify(out)).not.toContain(EMAIL);
  });

  it('supporte les cycles et les valeurs non objet', () => {
    const a: Record<string, unknown> = { email: 'x' };
    a.self = a;
    expect(() => redactDeep(a)).not.toThrow();
    expect(redactDeep('texte')).toBe('texte');
    expect(redactDeep(null)).toBeNull();
  });
});
