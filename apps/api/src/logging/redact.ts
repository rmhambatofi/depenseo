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
 * Erreur réduite à son type, son code et sa pile sans le message : les messages de bibliothèques
 * (mysql2 « Duplicate entry 'a@b.fr' », Drizzle « Failed query … params: … » sur plusieurs lignes)
 * peuvent contenir des données personnelles. Le message entier est retiré avant de garder les
 * seules lignes « at … », pour qu'une valeur saisie contenant « \n    at » ne passe pas.
 * `code`/`errno` sont repris de la première `cause` qui en porte (erreur du pilote sous Drizzle).
 */
export function describeError(error: Error): Record<string, unknown> {
  let code: unknown;
  let errno: unknown;
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const fields = current as { code?: unknown; errno?: unknown };
    code ??=
      typeof fields.code === 'string' || typeof fields.code === 'number' ? fields.code : undefined;
    errno ??= typeof fields.errno === 'number' ? fields.errno : undefined;
    current = current.cause;
  }
  const stack = error.stack ?? '';
  const header = `${error.name}: ${error.message}`;
  const body = stack.startsWith(header) ? stack.slice(header.length) : '';
  const frames = body.split('\n').filter((line) => /^\s+at /.test(line));
  return {
    type: error.name,
    ...(code === undefined ? {} : { code }),
    ...(errno === undefined ? {} : { errno }),
    stack: frames.length === 0 ? undefined : frames.join('\n'),
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
