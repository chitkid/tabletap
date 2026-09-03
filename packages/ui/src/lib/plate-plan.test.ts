import { describe, expect, it } from 'vitest';
import {
  PALETTE_SLOTS,
  PLATE_KINDS,
  hashSeed,
  kindFromCategory,
  mulberry32,
  planPlate,
} from './plate-plan';

const inPlate = (x: number, y: number, r: number, plateR: number) =>
  Math.hypot(x - 64, y - 64) + r <= plateR + 0.001;

describe('plate planner', () => {
  it('is deterministic', () => {
    expect(planPlate('Margherita Flatbread', 'flatbread')).toEqual(
      planPlate('Margherita Flatbread', 'flatbread'),
    );
    expect(JSON.stringify(planPlate('Margherita Flatbread', 'flatbread'))).not.toEqual(
      JSON.stringify(planPlate('Mushroom & Taleggio', 'flatbread')),
    );
  });
  it('maps categories to kinds', () => {
    expect(kindFromCategory('Flatbreads')).toBe('flatbread');
    expect(kindFromCategory('Bowls')).toBe('bowl');
    expect(kindFromCategory('Sides')).toBe('side');
    expect(kindFromCategory('Drinks')).toBe('drink');
    expect(kindFromCategory('Specials')).toBe('side');
  });
  it('keeps every shape inside the plate and every slot in range', () => {
    for (const kind of PLATE_KINDS) {
      for (const seed of ['a', 'Ember Salmon Bowl', 'House Lemonade', 'Furnace Potatoes']) {
        const plan = planPlate(seed, kind);
        expect(plan.viewBox).toBe(128);
        expect(plan.plate.r).toBeGreaterThan(40);
        for (const s of plan.shapes) {
          expect(s.slot).toBeGreaterThanOrEqual(0);
          expect(s.slot).toBeLessThan(PALETTE_SLOTS);
          if (s.type === 'circle') expect(inPlate(s.cx, s.cy, s.r, plan.plate.r)).toBe(true);
          if (s.type === 'ellipse')
            expect(inPlate(s.cx, s.cy, Math.max(s.rx, s.ry), plan.plate.r)).toBe(true);
          if (s.type === 'stroke') {
            expect(inPlate(s.x1, s.y1, s.width / 2, plan.plate.r)).toBe(true);
            expect(inPlate(s.x2, s.y2, s.width / 2, plan.plate.r)).toBe(true);
          }
          if (s.type === 'wedge' || s.type === 'arc')
            expect(inPlate(s.cx, s.cy, s.r, plan.plate.r)).toBe(true);
        }
      }
    }
  });
  it('gives each kind its own composition', () => {
    expect(
      planPlate('x', 'flatbread').shapes.filter((s) => s.type === 'circle').length,
    ).toBeGreaterThanOrEqual(5);
    expect(
      planPlate('x', 'bowl').shapes.filter((s) => s.type === 'wedge').length,
    ).toBeGreaterThanOrEqual(3);
    expect(planPlate('x', 'drink').shapes.some((s) => s.type === 'stroke')).toBe(true);
    expect(
      planPlate('x', 'side').shapes.filter((s) => s.type === 'ellipse').length,
    ).toBeGreaterThanOrEqual(4);
  });
  it('has a stable hash and prng', () => {
    expect(hashSeed('a')).toBe(hashSeed('a'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
    const r1 = mulberry32(1),
      r2 = mulberry32(1);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
    for (let i = 0; i < 100; i++) {
      const v = r1();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
