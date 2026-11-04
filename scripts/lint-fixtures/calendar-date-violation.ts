// Fixture volontairement fautive : vérifiée par scripts/eslint-rules.test.mjs (NF-FMT-08).
export const bad = new Date('2026-11-03');
export const badDoubleQuotes = new Date('2026-11-03');
export const badParse = Date.parse('2026-11-03');
export const badTemplate = new Date(`2026-11-03`);
export const badTemplateParse = Date.parse(`2026-11-03`);
export const badYearMonth = new Date('2026-11');
export const badYear = new Date('2026');
