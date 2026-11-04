// Validation des corps de requête par zod (ADR-013). Le `detail` ne nomme que les champs fautifs,
// jamais les valeurs reçues (mot de passe, adresse…).
import type { ZodType } from 'zod';
import { ProblemException } from '../errors/problem.exception.js';

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body ?? {});
  if (parsed.success) return parsed.data;
  const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(corps)'))];
  throw new ProblemException(400, `Champs invalides : ${fields.join(', ')}`);
}
