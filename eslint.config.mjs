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
      '**/coverage/**',
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
          allowDefaultProject: ['*.mjs', 'scripts/*.mjs', 'scripts/lint-fixtures/*.ts'],
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
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
  prettier,
);
