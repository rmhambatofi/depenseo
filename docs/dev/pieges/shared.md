# Pièges — `packages/shared` et `packages/api-client`

- Types (ADR-011) : `Cents`, `CurrencyCode`, `CalendarDate` (brands), `formatAmount` (chaîne décimale exacte vers Intl), `parseAmountInput` → `{ok,cents}|{ok:false,error}`, `decimalAmount`. Décimales par devise = table ISO 4217 figée dans `currency.ts`, jamais Intl/ICU. Espaces insécables écrits ` `/` `.
- Périodes (ADR-012) : `src/period.ts` — `periodContaining/nextPeriod/previousPeriod` (`{kind:'month',startDay 1–31}` repli fin de mois, `{kind:'week',startDay? ISO 1–7}`), `todayIn(tz, Temporal.Instant)`, `toPlainDate/toCalendarDate`, `normalizeTimeZone`. Importer `Temporal` depuis `temporal-polyfill` (1.0.7), jamais le global (Node 26 l'a, Node 22 non).
- Suites multi-fuseaux nommées `*.tz.test.ts` / `*.tz.spec.ts`, lancées par `test:tz` de chaque paquet (racine : `pnpm test:tz`).
- Paquet compilé : `exports` types→`src`, default→`dist`. Le `build` de l'API compile `shared` d'abord ; Node lit `dist` → recompiler après toute modif. Futurs Vite (admin/web) : même alias que Vitest. Déploiement : embarquer `packages/shared/dist`.
- `packages/api-client/src/schema.ts` est généré par `pnpm --filter api openapi` (ADR-045) : ne pas l'éditer à la main.
