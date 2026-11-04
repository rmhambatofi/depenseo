// Registre des tâches traitées par le cron : chaque fonctionnalité y ajoute son gestionnaire
// (e-mails P1-05, récurrences P4…) et, au besoin, ses tâches périodiques.
import type { JobHandler } from './job-runner.js';
import { purgeFinishedJobs, type ScheduledTask } from './scheduler.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registre hétérogène
export function jobHandlers(): JobHandler<any>[] {
  return [];
}

export function scheduledTasks(): ScheduledTask[] {
  return [purgeFinishedJobs()];
}
