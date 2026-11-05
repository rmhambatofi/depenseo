// Registre des tâches traitées par le cron : chaque fonctionnalité y ajoute son gestionnaire
// (e-mails P1-05 et P1-07, notifications push P4-04…) et, au besoin, ses tâches périodiques.
import { passwordResetEmailHandler } from '../auth/password-reset-email.job.js';
import { purgeExpiredRefreshTokens } from '../auth/refresh-token-purge.js';
import {
  type VerificationEmailDeps,
  verificationEmailHandler,
} from '../auth/verification-email.job.js';
import { type ExportJobDeps, generateExportHandler } from '../exports/export-job.js';
import { purgeExpiredExports } from '../exports/export-purge.js';
import type { EncryptedFileStore } from '../exports/file-store.js';
import type { JobHandler } from './job-runner.js';
import { scheduleDailyReminders } from '../notifications/daily-reminders.js';
import { type NotifyDeps, notifyHandler } from '../notifications/notify.handler.js';
import { processDueOccurrences } from '../recurring/due-occurrences.js';
import { scheduleOccurrenceReminders } from '../recurring/occurrence-reminders.js';
import { generateDueOccurrences } from '../recurring/occurrence-generation.js';
import { purgeDeletedSyncRows } from '../sync/deleted-rows-purge.js';
import { purgeFinishedJobs, type ScheduledTask } from './scheduler.js';

/** Dépendances des gestionnaires : base, horloge, e-mail, push, fichiers chiffrés. */
export type JobDeps = VerificationEmailDeps & NotifyDeps & ExportJobDeps;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registre hétérogène
export function jobHandlers(deps: JobDeps): JobHandler<any>[] {
  return [
    verificationEmailHandler(deps),
    passwordResetEmailHandler(deps),
    notifyHandler(deps),
    generateExportHandler(deps),
  ];
}

/** `files` absent (stockage non configuré) : aucun export n'existe, pas de purge de fichiers. */
export function scheduledTasks(
  deps: { files?: EncryptedFileStore | undefined } = {},
): ScheduledTask[] {
  return [
    purgeFinishedJobs(),
    purgeExpiredRefreshTokens(),
    purgeDeletedSyncRows(),
    generateDueOccurrences(),
    processDueOccurrences(),
    scheduleOccurrenceReminders(),
    scheduleDailyReminders(),
    ...(deps.files ? [purgeExpiredExports(deps.files)] : []),
  ];
}
