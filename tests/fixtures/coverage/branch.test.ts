import { expect, it } from 'vitest';

import { uncoveredBranch } from './branch';

it('covers only one of the two branches on purpose', () => {
  expect(uncoveredBranch(true)).toBe('covered');
});
