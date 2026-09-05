import { describe, expect, it } from 'vitest';
import { MOTION } from './motion';

describe('MOTION', () => {
  it('resolves every value to a var(--motion-*) reference, never a literal', () => {
    for (const [key, value] of Object.entries(MOTION)) {
      expect(value, `MOTION.${key} should be a var(--motion-...) reference`).toMatch(
        /^var\(--motion-[a-z-]+\)$/,
      );
    }
  });
});
