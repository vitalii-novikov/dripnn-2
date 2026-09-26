import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Фикстура для контрактного теста: ровно 50% покрытия веток при пороге 80%.
// Единственное её назначение — упасть.
const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    root: fixtureDirectory,
    include: ['branch.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['branch.ts'],
      reporter: ['text'],
      reportsDirectory: path.resolve(fixtureDirectory, '../../../coverage/contract'),
      thresholds: { branches: 80 },
    },
  },
});
