// Validation des paramètres de requête par zod (ADR-025). Comme `parseBody`, le `detail` ne nomme
// que les paramètres fautifs, jamais les valeurs reçues.
import type { ZodType } from 'zod';
import { ProblemException } from '../errors/problem.exception.js';

export function parseQuery<T>(schema: ZodType<T>, query: unknown): T {
  // `req.query` d'Express 5 est un objet sans prototype : copie en objet ordinaire.
  const parsed = schema.safeParse({ ...(query ?? {}) });
  if (parsed.success) return parsed.data;
  const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? '(requête)')))];
  throw new ProblemException(400, `Paramètres invalides : ${fields.join(', ')}`);
}
