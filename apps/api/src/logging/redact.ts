// Expurgation des journaux (NF-SEC-06) : montants, identité, secrets, notes et commerçants.
export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY =
  /^(amount.*|.*e?mail.*|.*password.*|.*token.*|.*secret.*|notes?|merchant|authorization|cookie|set-cookie|phone.*|iban|(display|first|last|full)_?name)$/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Erreur réduite à son type, son code et sa pile sans la ligne de message : les messages
 * de bibliothèques (ex. mysql2 « Duplicate entry 'a@b.fr' ») peuvent contenir des données personnelles.
 */
export function describeError(error: Error): Record<string, unknown> {
  const code = (error as { code?: unknown }).code;
  const stack = error.stack ?? '';
  const frames = stack.indexOf('\n    at ');
  return {
    type: error.name,
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
    stack: frames === -1 ? undefined : stack.slice(frames + 1),
  };
}

/**
 * Copie où toute valeur rangée sous une clé sensible devient `[REDACTED]`. Ne descend que dans
 * les objets simples et tableaux : les autres instances (requête, réponse, Buffer) sont laissées
 * aux serializers de pino, qui ne gardent que des champs sûrs.
 */
export function redactDeep(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return describeError(value);
  if (seen.has(value)) return '[Circular]';
  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item) => redactDeep(item, seen));
  }
  if (!isPlainObject(value)) return value;
  seen.add(value);
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactDeep(inner, seen);
  }
  return out;
}
