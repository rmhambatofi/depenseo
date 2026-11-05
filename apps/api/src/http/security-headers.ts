// En-têtes de sécurité posés sur toute réponse (NF-SEC-01, NF-SEC-04, ADR-062). Écrits à la main
// plutôt qu'avec helmet : liste courte, figée par `test/security/headers.spec.ts`.
import type { NextFunction, Request, Response } from 'express';

/**
 * L'API ne sert que du JSON et des fichiers téléchargés : rien ne doit y être chargé, exécuté ni
 * encadré. Les pages du back-office remplacent cette politique par la leur (`CONSOLE_CSP`).
 */
export const API_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const HEADERS: Readonly<Record<string, string>> = {
  // Un an, sous-domaines compris ; pas de `preload` (inscription difficilement réversible).
  // TLS est terminé par o2switch : le navigateur ignore l'en-tête reçu en HTTP clair.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': API_CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set(HEADERS);
  next();
}
