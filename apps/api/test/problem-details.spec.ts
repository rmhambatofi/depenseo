import { type ArgumentsHost, BadRequestException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProblemDetailsFilter } from '../src/errors/problem-details.filter.js';
import { ProblemException } from '../src/errors/problem.exception.js';
import { http, startTestApp } from './support/app.js';

describe('erreurs RFC 7807', () => {
  let app: INestApplication;
  beforeAll(async () => ({ app } = await startTestApp()));
  afterAll(() => app.close());

  it('une route inconnue renvoie 404 en application/problem+json', async () => {
    const res = await request(http(app)).get('/api/v1/nope?email=a%40b.fr');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(JSON.parse(res.text)).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/api/v1/nope',
    });
  });

  it('un JSON mal formé renvoie 400 en problem+json sans écho du corps', async () => {
    const res = await request(http(app))
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"email": a@b.fr, "amountCents": 98765}');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.text).not.toContain('a@b.fr');
    expect(res.text).not.toContain('98765');
    expect(JSON.parse(res.text)).toMatchObject({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
    });
  });
});

describe('ProblemDetailsFilter', () => {
  function run(exception: unknown) {
    const sent: { status?: number; type?: string; body?: string } = {};
    const res = {
      status(s: number) {
        sent.status = s;
        return this;
      },
      type(t: string) {
        sent.type = t;
        return this;
      },
      send(b: string) {
        sent.body = b;
        return this;
      },
    };
    const req = { method: 'POST', originalUrl: '/api/v1/expenses?email=a%40b.fr' };
    const host = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({ ...res, headersSent: false }),
      }),
    };
    new ProblemDetailsFilter().catch(exception, host as unknown as ArgumentsHost);
    return sent;
  }

  it('une erreur inattendue donne un 500 générique sans son message', () => {
    const sent = run(new Error('SQL failed for a@b.fr amount 12345'));
    expect(sent.status).toBe(500);
    expect(sent.type).toBe('application/problem+json');
    expect(JSON.parse(sent.body ?? '')).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      instance: '/api/v1/expenses',
    });
  });

  it('une HttpException quelconque n’expose pas son message', () => {
    const sent = run(new BadRequestException('Unexpected token a@b.fr is not valid JSON'));
    expect(JSON.parse(sent.body ?? '')).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      instance: '/api/v1/expenses',
    });
  });

  it('une ProblemException expose son detail', () => {
    const sent = run(new ProblemException(409, 'Carnet déjà synchronisé'));
    expect(JSON.parse(sent.body ?? '')).toMatchObject({
      status: 409,
      title: 'Conflict',
      detail: 'Carnet déjà synchronisé',
    });
  });
});
