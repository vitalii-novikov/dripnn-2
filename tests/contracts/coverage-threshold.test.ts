import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Порог покрытия ценен ровно настолько, насколько он роняет сборку. Этот тест
// проверяет сам механизм, а не цифру: запускает заведомо недопокрытую фикстуру
// и требует ненулевого кода возврата.
describe('coverage contract', () => {
  it('fails the run when branch coverage drops below 80%', () => {
    const result = spawnSync(
      process.execPath,
      [
        path.resolve('node_modules/vitest/vitest.mjs'),
        'run',
        '--config',
        'tests/fixtures/coverage/vitest.config.mts',
        '--coverage',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/coverage.*threshold/i);
  }, 120_000);
});
