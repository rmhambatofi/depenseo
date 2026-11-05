// Envoi des notifications push (F-NOT-01, §8 : APNs et FCM). L'interface isole les services
// externes : faux en test (`test/support/push.ts`), APNs (`apns-sender.ts`) et FCM (`fcm-sender.ts`)
// en production. Contenu sans aucun montant (ADR-003) ; le jeton n'est jamais journalisé.
import type { PushPlatform } from '../db/schema/index.js';

export interface PushTarget {
  platform: PushPlatform;
  token: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Données d'ouverture (type, identifiants) : jamais de montant ni de libellé saisi. */
  data: Record<string, string>;
}

/**
 * `sent` : accepté par le service ; `invalid_token` : appareil désinscrit (ligne à supprimer) ;
 * `unavailable` : service non configuré pour cette plateforme (rien envoyé, pas de nouvel essai).
 * Une erreur transitoire (réseau, 5xx, 429) est levée : la tâche sera relancée.
 */
export type PushResult = 'sent' | 'invalid_token' | 'unavailable';

export interface PushSender {
  send(target: PushTarget, message: PushMessage, signal?: AbortSignal): Promise<PushResult>;
  /** Libère les connexions persistantes (fin du passage cron). */
  close?(): void;
}

/** Aiguille vers APNs ou FCM selon la plateforme ; plateforme non configurée → `unavailable`. */
export class RoutingPushSender implements PushSender {
  constructor(private readonly senders: Partial<Record<PushPlatform, PushSender>>) {}

  send(target: PushTarget, message: PushMessage, signal?: AbortSignal): Promise<PushResult> {
    const sender = this.senders[target.platform];
    return sender ? sender.send(target, message, signal) : Promise.resolve('unavailable');
  }

  close(): void {
    for (const sender of Object.values(this.senders)) sender.close?.();
  }
}
