import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'lib/supabase/database.types.ts',
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Аргумент, существующий ради типа, но не используемый телом, — норма
      // для моков и обработчиков. Префикс _ делает намерение явным.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
