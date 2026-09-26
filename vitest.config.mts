import { defineConfig } from 'vitest/config';

// Покрытие меряется только по unit-слою. pgTAP и integration — отдельные
// обязательные джобы CI: засчитай их процентом, и дырявая авторизация
// спрячется за красивой цифрой.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['features/**/*.unit.test.ts', 'lib/**/*.unit.test.ts', 'tests/contracts/**/*.test.ts'],
    exclude: ['tests/fixtures/**', 'tests/integration/**', 'tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['features/**/*.ts', 'lib/**/*.ts'],
      exclude: ['**/*.test.ts', 'lib/supabase/database.types.ts'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': import.meta.dirname,
      'server-only': new URL('./tests/stubs/server-only.ts', import.meta.url).pathname,
    },
  },
});
