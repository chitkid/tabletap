import { describe, expect, it } from 'vitest';
import { stableId } from './ids';

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('stableId', () => {
  it('is a version 5 uuid', () => {
    expect(stableId('table', 'little-furnace:7')).toMatch(UUID_V5);
  });
  it('gives the same id for the same input, every time', () => {
    expect(stableId('table', 'little-furnace:7')).toBe(stableId('table', 'little-furnace:7'));
  });
  it('separates kinds and keys', () => {
    expect(stableId('table', 'little-furnace:7')).not.toBe(stableId('item', 'little-furnace:7'));
    expect(stableId('table', 'little-furnace:7')).not.toBe(stableId('table', 'little-furnace:8'));
  });
});
