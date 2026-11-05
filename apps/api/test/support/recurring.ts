// Client de test des dépenses récurrentes et des échéances (P4-01).
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { newId } from '../../src/db/uuid.js';
import type { OccurrenceView } from '../../src/recurring/occurrences.service.js';
import type { RecurringView } from '../../src/recurring/recurring.service.js';
import type { Tenant } from './access.js';
import { http } from './app.js';
import { auth } from './expenses.js';

export type RecurringBody = Omit<RecurringView, 'createdAt' | 'updatedAt'> & { detail?: string };
export type OccurrenceBody = Omit<OccurrenceView, 'createdAt' | 'updatedAt'> & {
  detail?: string;
};

export function recurringClient(app: () => INestApplication) {
  const base = (t: Tenant) => `/api/v1/notebooks/${t.notebookId}`;
  const call = (
    t: Tenant,
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    body?: object,
  ) =>
    request(http(app()))
      [method](`${base(t)}${path}`)
      .set(auth(t))
      .send(body);
  return {
    /** Corps de création complet ; `overrides` remplace des champs. */
    body: (categoryId: string, overrides: object = {}) => ({
      id: newId(),
      name: 'Loyer',
      amount: 85_000,
      frequency: 'monthly',
      startDate: '2026-12-05',
      categoryId,
      ...overrides,
    }),
    create: (t: Tenant, body: object) => call(t, 'post', '/recurring-expenses', body),
    list: (t: Tenant) => call(t, 'get', '/recurring-expenses'),
    getOne: (t: Tenant, id: string) => call(t, 'get', `/recurring-expenses/${id}`),
    patch: (t: Tenant, id: string, body: object) =>
      call(t, 'patch', `/recurring-expenses/${id}`, body),
    remove: (t: Tenant, id: string) => call(t, 'delete', `/recurring-expenses/${id}`),
    occurrences: async (t: Tenant, id: string) => {
      const res = await call(t, 'get', `/recurring-expenses/${id}/occurrences`);
      if (res.status !== 200) throw new Error(`occurrences ${res.status}`);
      return res.body as OccurrenceBody[];
    },
    adjust: (t: Tenant, occurrenceId: string, body: object) =>
      call(t, 'patch', `/occurrences/${occurrenceId}`, body),
    pay: (t: Tenant, occurrenceId: string, body: object) =>
      call(t, 'post', `/occurrences/${occurrenceId}/pay`, body),
    skip: (t: Tenant, occurrenceId: string) => call(t, 'post', `/occurrences/${occurrenceId}/skip`),
  };
}
