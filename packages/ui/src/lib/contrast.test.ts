import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

describe('contrast', () => {
  it('computes luminance of black and white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });
  it('black on white is 21:1 and symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 2);
  });
  it('matches a known WCAG example', () => {
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });
  it('accepts 3-digit hex', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 2);
  });
});
