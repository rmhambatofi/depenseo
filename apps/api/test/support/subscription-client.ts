// Client HTTP des routes d'abonnement (P5-01) pour les suites `test/subscriptions/`.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { expect } from 'vitest';
import type { Tenant } from './access.js';
import { http } from './app.js';

export interface EntitlementsBody {
  plan: string;
  premiumUntil: string | null;
  trialEndsAt: string | null;
  trialAvailable: boolean;
}

export function subscriptionClient(app: () => INestApplication) {
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  return {
    /** Nouvelle session du compte (autre appareil, ou jeton d'accès périmé). */
    async login(t: Tenant): Promise<string> {
      const res = await request(http(app()))
        .post('/api/v1/auth/login')
        .send({ email: t.email, password: t.password });
      expect(res.status).toBe(200);
      return (res.body as { accessToken: string }).accessToken;
    },
    get: (token: string) => request(http(app())).get('/api/v1/subscriptions').set(bearer(token)),
    startTrial: (token: string) =>
      request(http(app())).post('/api/v1/subscriptions/trial').set(bearer(token)),
    verify: (token: string, body: object) =>
      request(http(app())).post('/api/v1/subscriptions/verify').set(bearer(token)).send(body),
  };
}
