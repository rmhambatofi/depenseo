// Configuration des services push (NF-SEC-01 : variables d'environnement uniquement). Chaque service
// est facultatif mais complet : toutes ses variables ou aucune. Service absent → envois `unavailable`
// pour sa plateforme (aucune erreur, utile en développement).
// APNs : APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (PEM, `\n` échappés admis), APNS_TOPIC,
// APNS_ENVIRONMENT (production | sandbox, défaut production).
// FCM : FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY (PEM du compte de service).
import { z } from 'zod';
import type { Clock } from '../clock.js';
import { parseEnv } from '../config/env.js';
import { APNS_ORIGINS, type ApnsConfig, ApnsPushSender } from './apns-sender.js';
import { FCM_API_ORIGIN, FCM_TOKEN_URL, type FcmConfig, FcmPushSender } from './fcm-sender.js';
import { type PushSender, RoutingPushSender } from './push-sender.js';

const pem = z
  .string()
  .transform((value) => value.replace(/\\n/g, '\n'))
  .refine((value) => value.includes('-----BEGIN PRIVATE KEY-----'));

const APNS_KEYS = ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY', 'APNS_TOPIC'] as const;
const FCM_KEYS = ['FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL', 'FCM_PRIVATE_KEY'] as const;

const pushSchema = z
  .object({
    APNS_KEY_ID: z
      .string()
      .regex(/^[A-Z0-9]{10}$/)
      .optional(),
    APNS_TEAM_ID: z
      .string()
      .regex(/^[A-Z0-9]{10}$/)
      .optional(),
    APNS_PRIVATE_KEY: pem.optional(),
    APNS_TOPIC: z.string().min(1).max(255).optional(),
    APNS_ENVIRONMENT: z.enum(['production', 'sandbox']).default('production'),
    FCM_PROJECT_ID: z.string().min(1).max(100).optional(),
    FCM_CLIENT_EMAIL: z.email().optional(),
    FCM_PRIVATE_KEY: pem.optional(),
  })
  .superRefine((env, ctx) => {
    for (const keys of [APNS_KEYS, FCM_KEYS]) {
      const present = keys.filter((k) => env[k] !== undefined);
      if (present.length === 0 || present.length === keys.length) continue;
      for (const k of keys.filter((key) => env[key] === undefined)) {
        ctx.addIssue({ code: 'custom', path: [k], message: 'requise par les autres variables' });
      }
    }
  });

export interface PushConfig {
  apns?: ApnsConfig;
  fcm?: FcmConfig;
}

export function loadPushConfig(env: Readonly<Record<string, string | undefined>>): PushConfig {
  const parsed = parseEnv(pushSchema, env);
  const config: PushConfig = {};
  if (parsed.APNS_KEY_ID && parsed.APNS_TEAM_ID && parsed.APNS_PRIVATE_KEY && parsed.APNS_TOPIC) {
    config.apns = {
      keyId: parsed.APNS_KEY_ID,
      teamId: parsed.APNS_TEAM_ID,
      privateKey: parsed.APNS_PRIVATE_KEY,
      topic: parsed.APNS_TOPIC,
      origin: APNS_ORIGINS[parsed.APNS_ENVIRONMENT],
    };
  }
  if (parsed.FCM_PROJECT_ID && parsed.FCM_CLIENT_EMAIL && parsed.FCM_PRIVATE_KEY) {
    config.fcm = {
      projectId: parsed.FCM_PROJECT_ID,
      clientEmail: parsed.FCM_CLIENT_EMAIL,
      privateKey: parsed.FCM_PRIVATE_KEY,
      tokenUrl: FCM_TOKEN_URL,
      apiOrigin: FCM_API_ORIGIN,
    };
  }
  return config;
}

export function createPushSender(config: PushConfig, clock: Clock): PushSender {
  return new RoutingPushSender({
    ...(config.apns && { ios: new ApnsPushSender(config.apns, clock) }),
    ...(config.fcm && { android: new FcmPushSender(config.fcm, clock) }),
  });
}
