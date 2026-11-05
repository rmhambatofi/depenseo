// Configuration ESLint (flat config) commune au monorepo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Une date calendaire AAAA-MM-JJ passée à Date est lue comme minuit UTC : décalage d'un jour
// selon le fuseau (NF-FMT-08, ADR-002). Utiliser CalendarDate / Temporal.PlainDate.
const CALENDAR_DATE = '/^\\d{4}(-\\d{2}){0,2}$/'; // AAAA, AAAA-MM, AAAA-MM-JJ : tous lus en UTC
const dateTargets = [
  "NewExpression[callee.name='Date']",
  "CallExpression[callee.object.name='Date'][callee.property.name='parse']",
];
const calendarDateMessage =
  'Date calendaire interdite dans Date (NF-FMT-08) : utilise CalendarDate ou Temporal.PlainDate.';

export default tseslint.config(
  {
    // Les fixtures sont fautives par construction : lintées seulement par scripts/eslint-rules.test.mjs.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-e2e/**',
      // Build factice de apps/admin servi par l'API dans les tests (ADR-044).
      'apps/api/test/fixtures/admin-dist/**',
      '**/coverage/**',
      // Généré par openapi-typescript (`pnpm --filter api openapi`), comparé par src/schema.test.ts
      'packages/api-client/src/schema.ts',
      'mobile/**',
      'scripts/lint-fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            '*.mjs',
            'scripts/*.mjs',
            'packages/*/scripts/*.mjs',
            'scripts/lint-fixtures/*.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        ...dateTargets.flatMap((target) => [
          {
            selector: `${target}[arguments.0.value=${CALENDAR_DATE}]`,
            message: calendarDateMessage,
          },
          {
            selector: `${target}[arguments.0.type='TemplateLiteral'][arguments.0.expressions.length=0][arguments.0.quasis.0.value.cooked=${CALENDAR_DATE}]`,
            message: calendarDateMessage,
          },
        ]),
      ],
    },
  },
  {
    // Page de connexion publique du back-office (§8.5, F-ADM-02, ADR-044) : aucun code admin.
    files: ['apps/admin/src/login/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/app', '**/app/**', 'react', 'react-*', 'react-admin', 'ra-*', '@mui/*'],
              message: 'La page de connexion publique ne doit embarquer aucun code admin.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
  prettier,
);
