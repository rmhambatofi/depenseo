// Émetteurs APNs et FCM (F-NOT-01, §8) contre des serveurs locaux : forme des requêtes, jetons
// fournisseur vérifiés, corps sans montant, traduction des réponses (jeton invalide, panne), et
// configuration par variables d'environnement (tout ou rien par service).
import { generateKeyPairSync } from 'node:crypto';
import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer as createH2Server, type Http2Server } from 'node:http2';
import type { AddressInfo } from 'node:net';
import { decodeProtectedHeader, importSPKI, jwtVerify } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config/env.js';
import { ApnsPushSender } from '../../src/notifications/apns-sender.js';
import { FcmPushSender } from '../../src/notifications/fcm-sender.js';
import { createPushSender, loadPushConfig } from '../../src/notifications/push-config.js';
import type { PushMessage } from '../../src/notifications/push-sender.js';
import { FakeClock } from '../support/clock.js';

const MESSAGE: PushMessage = {
  title: 'Dépense inhabituelle',
  body: 'Une dépense nettement plus élevée que d’habitude vient d’être enregistrée.',
  data: { kind: 'unusual_expense', notebookId: 'nb', expenseId: 'ex' },
};

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pkcs8 = (k: typeof ec.privateKey) => k.export({ type: 'pkcs8', format: 'pem' }).toString();
const spki = (k: typeof ec.publicKey) => k.export({ type: 'spki', format: 'pem' }).toString();

interface Received {
  path: string;
  headers: Record<string, unknown>;
  body: string;
}

let closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers) close();
  closers = [];
});

async function h2Server(reply: (r: Received) => { status: number; body?: object }) {
  const received: Received[] = [];
  const server: Http2Server = createH2Server();
  server.on('stream', (stream, headers) => {
    let body = '';
    stream.setEncoding('utf8');
    stream.on('data', (c: string) => (body += c));
    stream.on('end', () => {
      const r = { path: String(headers[':path']), headers, body };
      received.push(r);
      const { status, body: out } = reply(r);
      stream.respond({ ':status': status, 'content-type': 'application/json' });
      stream.end(out ? JSON.stringify(out) : '');
    });
  });
  const sessions: string[] = [];
  server.on('session', () => sessions.push('open'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => server.close());
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    received,
    sessions,
  };
}

async function httpServer(reply: (r: Received) => { status: number; body?: object }) {
  const received: Received[] = [];
  const server: Server = createHttpServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => (body += c));
    req.on('end', () => {
      const r = { path: req.url ?? '', headers: req.headers, body };
      received.push(r);
      const { status, body: out } = reply(r);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(out ? JSON.stringify(out) : '');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => server.close());
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, received };
}

describe('ApnsPushSender', () => {
  const clock = new FakeClock(Date.UTC(2025, 5, 10, 10));
  const apns = (origin: string) =>
    new ApnsPushSender(
      {
        keyId: 'KEY1234567',
        teamId: 'TEAM123456',
        privateKey: pkcs8(ec.privateKey),
        topic: 'fr.depenseo.app',
        origin,
      },
      clock,
    );

  it('une seule connexion HTTP/2 pour plusieurs envois, fermée par close()', async () => {
    const server = await h2Server(() => ({ status: 200 }));
    const sender = apns(server.origin);
    await sender.send({ platform: 'ios', token: 'a' }, MESSAGE);
    await sender.send({ platform: 'ios', token: 'b' }, MESSAGE);
    expect(server.received).toHaveLength(2);
    expect(server.sessions).toHaveLength(1);
    sender.close();
    await sender.send({ platform: 'ios', token: 'c' }, MESSAGE);
    expect(server.sessions).toHaveLength(2);
    sender.close();
  });

  it('POST /3/device/<jeton> avec jeton fournisseur ES256 et corps sans montant', async () => {
    const server = await h2Server(() => ({ status: 200 }));
    const sender = apns(server.origin);
    expect(await sender.send({ platform: 'ios', token: 'abc123' }, MESSAGE)).toBe('sent');
    const [r] = server.received;
    expect(r!.path).toBe('/3/device/abc123');
    expect(r!.headers).toMatchObject({
      ':method': 'POST',
      'apns-topic': 'fr.depenseo.app',
      'apns-push-type': 'alert',
      'apns-priority': '10',
    });
    const jwt = String(r!.headers.authorization).replace(/^bearer /, '');
    expect(decodeProtectedHeader(jwt)).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' });
    const { payload } = await jwtVerify(jwt, await importSPKI(spki(ec.publicKey), 'ES256'), {
      currentDate: clock.now(),
    });
    expect(payload).toMatchObject({ iss: 'TEAM123456', iat: clock.now().getTime() / 1000 });
    expect(JSON.parse(r!.body)).toEqual({
      aps: { alert: { title: MESSAGE.title, body: MESSAGE.body }, sound: 'default' },
      ...MESSAGE.data,
    });
    // Jeton fournisseur réutilisé dans les 50 minutes, renouvelé ensuite.
    await sender.send({ platform: 'ios', token: 'abc123' }, MESSAGE);
    clock.advance(51 * 60_000);
    await sender.send({ platform: 'ios', token: 'abc123' }, MESSAGE);
    const tokens = server.received.map((x) => x.headers.authorization);
    expect(tokens[1]).toBe(tokens[0]);
    expect(tokens[2]).not.toBe(tokens[0]);
  });

  it.each([
    [410, 'Unregistered', 'invalid_token'],
    [400, 'BadDeviceToken', 'invalid_token'],
    [400, 'DeviceTokenNotForTopic', 'invalid_token'],
  ])('%i %s → %s', async (status, reason, expected) => {
    const server = await h2Server(() => ({ status, body: { reason } }));
    expect(await apns(server.origin).send({ platform: 'ios', token: 't' }, MESSAGE)).toBe(expected);
  });

  it('500 ou 429 → erreur sans le jeton d’appareil', async () => {
    const server = await h2Server(() => ({ status: 429, body: { reason: 'TooManyRequests' } }));
    const error = await apns(server.origin)
      .send({ platform: 'ios', token: 'secret-device-token' }, MESSAGE)
      .catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('429');
    expect((error as Error).message).not.toContain('secret-device-token');
  });

  it('serveur injoignable → erreur', async () => {
    await expect(
      apns('http://127.0.0.1:1').send({ platform: 'ios', token: 't' }, MESSAGE),
    ).rejects.toThrow('APNs injoignable');
  });
});

describe('FcmPushSender', () => {
  const clock = new FakeClock(Date.UTC(2025, 5, 10, 10));

  async function setup(reply: (r: Received) => { status: number; body?: object }) {
    const server = await httpServer((r) =>
      r.path === '/token'
        ? { status: 200, body: { access_token: 'ya29.test', expires_in: 3600 } }
        : reply(r),
    );
    const sender = new FcmPushSender(
      {
        projectId: 'depenseo-test',
        clientEmail: 'push@depenseo-test.iam.gserviceaccount.com',
        privateKey: pkcs8(rsa.privateKey),
        tokenUrl: `${server.origin}/token`,
        apiOrigin: server.origin,
      },
      clock,
    );
    return { server, sender };
  }

  it('jeton OAuth par assertion RS256 puis messages:send, corps sans montant', async () => {
    const { server, sender } = await setup(() => ({ status: 200, body: { name: 'x' } }));
    expect(await sender.send({ platform: 'android', token: 'fcm-tok' }, MESSAGE)).toBe('sent');
    await sender.send({ platform: 'android', token: 'fcm-tok' }, MESSAGE);
    const [oauth, ...sends] = server.received;
    expect(server.received.filter((r) => r.path === '/token')).toHaveLength(1);
    const form = new URLSearchParams(oauth!.body);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const { payload } = await jwtVerify(
      form.get('assertion')!,
      await importSPKI(spki(rsa.publicKey), 'RS256'),
      { currentDate: clock.now() },
    );
    expect(payload).toMatchObject({
      iss: 'push@depenseo-test.iam.gserviceaccount.com',
      aud: `${server.origin}/token`,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    });
    expect(sends[0]!.path).toBe('/v1/projects/depenseo-test/messages:send');
    expect(sends[0]!.headers.authorization).toBe('Bearer ya29.test');
    expect(JSON.parse(sends[0]!.body)).toEqual({
      message: {
        token: 'fcm-tok',
        notification: { title: MESSAGE.title, body: MESSAGE.body },
        data: MESSAGE.data,
        android: { priority: 'HIGH' },
      },
    });
  });

  it.each([
    [404, { error: { details: [{ errorCode: 'UNREGISTERED' }] } }],
    [400, { error: { message: 'The registration token is not a valid FCM registration token' } }],
  ])('%i → invalid_token', async (status, body) => {
    const { sender } = await setup(() => ({ status, body }));
    expect(await sender.send({ platform: 'android', token: 't' }, MESSAGE)).toBe('invalid_token');
  });

  it('404 sans UNREGISTERED (projet mal configuré) → erreur, appareil conservé', async () => {
    const { sender } = await setup(() => ({
      status: 404,
      body: { error: { message: 'Not found' } },
    }));
    await expect(sender.send({ platform: 'android', token: 't' }, MESSAGE)).rejects.toThrow(
      /FCM a répondu 404/,
    );
  });

  it('503 → erreur sans le jeton d’appareil', async () => {
    const { sender } = await setup(() => ({
      status: 503,
      body: { error: { details: [{ errorCode: 'UNAVAILABLE' }] } },
    }));
    const error = await sender
      .send({ platform: 'android', token: 'secret-device-token' }, MESSAGE)
      .catch((e: unknown) => e as Error);
    expect((error as Error).message).toContain('503');
    expect((error as Error).message).not.toContain('secret-device-token');
  });
});

describe('configuration push', () => {
  const APNS = {
    APNS_KEY_ID: 'KEY1234567',
    APNS_TEAM_ID: 'TEAM123456',
    APNS_PRIVATE_KEY: pkcs8(ec.privateKey).replace(/\n/g, '\\n'),
    APNS_TOPIC: 'fr.depenseo.app',
  };
  const FCM = {
    FCM_PROJECT_ID: 'depenseo',
    FCM_CLIENT_EMAIL: 'push@depenseo.iam.gserviceaccount.com',
    FCM_PRIVATE_KEY: pkcs8(rsa.privateKey),
  };

  it('aucune variable : aucun service, envois « unavailable »', async () => {
    const config = loadPushConfig({});
    expect(config).toEqual({});
    const sender = createPushSender(config, new FakeClock());
    expect(await sender.send({ platform: 'ios', token: 't' }, MESSAGE)).toBe('unavailable');
    expect(await sender.send({ platform: 'android', token: 't' }, MESSAGE)).toBe('unavailable');
  });

  it('services complets : PEM aux `\\n` échappés restauré, APNs production par défaut', () => {
    const config = loadPushConfig({ ...APNS, ...FCM });
    expect(config.apns).toMatchObject({
      origin: 'https://api.push.apple.com',
      privateKey: pkcs8(ec.privateKey),
    });
    expect(config.fcm).toMatchObject({ projectId: 'depenseo' });
    expect(loadPushConfig({ ...APNS, APNS_ENVIRONMENT: 'sandbox' }).apns?.origin).toBe(
      'https://api.sandbox.push.apple.com',
    );
  });

  it('service incomplet : refus qui nomme les variables manquantes sans valeur', () => {
    const partial: Record<string, string> = { ...APNS };
    delete partial.APNS_TOPIC;
    expect(() => loadPushConfig(partial)).toThrow(ConfigError);
    expect(() => loadPushConfig(partial)).toThrow('APNS_TOPIC');
    expect(() => loadPushConfig({ FCM_PROJECT_ID: 'x' })).toThrow('FCM_PRIVATE_KEY');
    try {
      loadPushConfig({ ...partial });
    } catch (error) {
      expect((error as Error).message).not.toContain('BEGIN PRIVATE KEY');
    }
  });
});
