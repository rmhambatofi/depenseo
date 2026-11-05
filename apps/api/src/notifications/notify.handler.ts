// Gestionnaire de la tâche `notify` (F-NOT-01, F-NOT-02, F-NOT-04, ADR-035). Au moment de l'envoi :
// 1. destinataire = propriétaire du carnet (le partage est hors MVP), ou le compte du rappel quotidien ;
// 2. notification devenue sans objet → abandon : carnet ou dépense supprimés, période de limite close,
//    échéance payée ou sautée, rappel quotidien d'un jour passé, rappel « jour J » d'une échéance
//    déjà signalée « à confirmer » (fusion) ;
// 3. type désactivé par le compte → abandon ;
// 4. plage de silence en cours → copie de la tâche à la fin de la plage (clé `deferred:<tâche>`) ;
// 5. envoi à chaque appareil du compte ; jeton refusé par le service → appareil supprimé.
import { todayIn } from '@depenseo/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import type { z } from 'zod';
import type { Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import {
  device,
  expense,
  notebook,
  occurrence,
  recurringExpense,
  user,
} from '../db/schema/index.js';
import { JobQueue } from '../jobs/job-queue.js';
import type { JobHandler } from '../jobs/job-runner.js';
import { globalLimitVersions } from '../limits/limits.service.js';
import { periodSlices } from '../limits/period-summary.js';
import { notificationMessage } from './notification-text.js';
import { loadNotificationSettings, notificationType } from './notification-settings.js';
import { NOTIFY } from './notify-job.js';
import type { PushSender } from './push-sender.js';
import { quietHoursEnd } from './quiet-hours.js';

type Payload = z.infer<typeof NOTIFY.payload>;

export interface NotifyDeps {
  db: Database;
  clock: Clock;
  push: PushSender;
}

interface Recipient {
  userId: string;
  language: string;
  timeZone: string;
}

const recipientColumns = { userId: user.id, language: user.language, timeZone: user.timeZone };

async function recipientOf(db: Database, payload: Payload): Promise<Recipient | undefined> {
  if (payload.kind === 'daily_reminder') {
    const [row] = await db.select(recipientColumns).from(user).where(eq(user.id, payload.userId));
    return row;
  }
  const [row] = await db
    .select(recipientColumns)
    .from(notebook)
    .innerJoin(user, eq(user.id, notebook.ownerId))
    .where(and(eq(notebook.id, payload.notebookId), isNull(notebook.deletedAt)));
  return row;
}

/** Vrai si l'événement notifié est toujours d'actualité à `now`. */
async function stillRelevant(
  db: Database,
  payload: Payload,
  recipient: Recipient,
  now: Date,
): Promise<boolean> {
  const today = todayIn(
    recipient.timeZone,
    Temporal.Instant.fromEpochMilliseconds(now.getTime()),
  ).toString();
  switch (payload.kind) {
    case 'daily_reminder':
      // Reporté au lendemain par la plage de silence : « dépenses du jour » serait faux (ADR-035).
      return payload.date === today;
    case 'limit': {
      // Période close (ou redécoupée par un changement de règle) : alerte périmée (ADR-029).
      const [slice] = periodSlices(await globalLimitVersions(db, payload.notebookId), today, 1);
      return slice?.start === payload.periodStart;
    }
    case 'unusual_expense': {
      const [row] = await db
        .select({ id: expense.id })
        .from(expense)
        .where(
          and(
            eq(expense.id, payload.expenseId),
            eq(expense.notebookId, payload.notebookId),
            isNull(expense.deletedAt),
          ),
        );
      return row !== undefined;
    }
    case 'occurrence_due':
    case 'occurrence_reminder': {
      const [row] = await db
        .select({ status: occurrence.status, requested: occurrence.confirmationRequestedAt })
        .from(occurrence)
        .innerJoin(recurringExpense, eq(recurringExpense.id, occurrence.recurringExpenseId))
        .where(
          and(
            eq(occurrence.id, payload.occurrenceId),
            eq(occurrence.notebookId, payload.notebookId),
            isNull(occurrence.deletedAt),
            isNull(recurringExpense.deletedAt),
          ),
        );
      if (row?.status !== 'pending') return false;
      // Fusion (ADR-035) : l'échéance « à confirmer » est déjà signalée ce jour-là.
      if (payload.kind === 'occurrence_reminder' && payload.reminder === 'due_date') {
        return row.requested === null;
      }
      return true;
    }
  }
}

export function notifyHandler(deps: NotifyDeps): JobHandler<Payload> {
  return {
    definition: NOTIFY,
    async handle(payload, { jobId, signal }) {
      const { db, clock, push } = deps;
      const now = clock.now();
      const recipient = await recipientOf(db, payload);
      if (!recipient) return;
      if (!(await stillRelevant(db, payload, recipient, now))) return;
      const settings = await loadNotificationSettings(db, recipient.userId);
      if (!settings[notificationType(payload.kind)]) return;

      const quietEnd = quietHoursEnd(
        Temporal.Instant.fromEpochMilliseconds(now.getTime()),
        recipient.timeZone,
        settings.quietHours,
      );
      if (quietEnd) {
        await new JobQueue(clock).enqueue(db, NOTIFY, payload, {
          runAt: new Date(quietEnd.epochMilliseconds),
          uniqueKey: `deferred:${jobId}`,
        });
        return;
      }

      const devices = await db
        .select({ id: device.id, platform: device.platform, token: device.pushToken })
        .from(device)
        .where(eq(device.userId, recipient.userId));
      const message = notificationMessage(payload, recipient.language);
      let failure: Error | undefined;
      for (const target of devices) {
        try {
          const result = await push.send(target, message, signal);
          if (result === 'invalid_token') {
            // Filtre sur le jeton : un appareil réenregistré entre-temps garde son nouveau jeton.
            await db
              .delete(device)
              .where(and(eq(device.id, target.id), eq(device.pushToken, target.token)));
          }
        } catch (error) {
          // Les autres appareils sont servis ; la tâche sera relancée (doublon possible, ADR-035).
          failure ??= error instanceof Error ? error : new Error('Échec d’envoi push');
        }
      }
      if (failure !== undefined) throw failure;
    },
  };
}
