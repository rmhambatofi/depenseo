// Registre des tâches traitées par le cron : chaque fonctionnalité y ajoute son gestionnaire
// (e-mails P1-05 et P1-07, récurrences P4…) et, au besoin, ses tâches périodiques.
import { passwordResetEmailHandler } from '../auth/password-reset-email.job.js';
import { purgeExpiredRefreshTokens } from '../auth/refresh-token-purge.js';
import {
  type VerificationEmailDeps,
  verificationEmailHandler,
} from '../auth/verification-email.job.js';
import type { JobHandler } from './job-runner.js';
import { generateDueOccurrences } from '../recurring/occurrence-generation.js';
import { purgeDeletedSyncRows } from '../sync/deleted-rows-purge.js';
import { purgeFinishedJobs, type ScheduledTask } from './scheduler.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registre hétérogène
export function jobHandlers(deps: VerificationEmailDeps): JobHandler<any>[] {
  return [verificationEmailHandler(deps), passwordResetEmailHandler(deps)];
}

export function scheduledTasks(): ScheduledTask[] {
  return [
    purgeFinishedJobs(),
    purgeExpiredRefreshTokens(),
    purgeDeletedSyncRows(),
    generateDueOccurrences(),
  ];
}
