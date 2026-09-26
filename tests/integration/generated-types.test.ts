import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('generated database types', () => {
  it('produce no schema diff against the committed contract', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-generated-types.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(`${result.stdout}\n${result.stderr}`.trim()).not.toMatch(/out of sync/u);
    expect(result.status).toBe(0);
  }, 120_000);
});
