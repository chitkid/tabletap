import type { PlateKind } from '@tabletap/shared';

/** Palette slots resolve to CSS custom properties --plate-slot-N in theme.css. */
export const PALETTE_SLOTS = 6;
const OAT = 0,
  EMBER = 1,
  EMBER_LIGHT = 2,
  OLIVE = 3,
  OLIVE_LIGHT = 4,
  INK = 5;

export type PlateShape =
  | { type: 'circle'; cx: number; cy: number; r: number; slot: number }
  | {
      type: 'ellipse';
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      rotate: number;
      slot: number;
    }
  | {
      type: 'arc';
      cx: number;
      cy: number;
      r: number;
      start: number;
      end: number;
      width: number;
      slot: number;
    }
  | { type: 'wedge'; cx: number; cy: number; r: number; start: number; end: number; slot: number }
  | { type: 'stroke'; x1: number; y1: number; x2: number; y2: number; width: number; slot: number };

export interface PlatePlan {
  kind: PlateKind;
  viewBox: 128;
  plate: { cx: 64; cy: 64; r: number };
  shapes: PlateShape[];
}

/** FNV-1a 32-bit. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (v: number) => Math.round(v * 10) / 10;
/** A point at polar (dist, angle) from the plate centre. */
const polar = (dist: number, angle: number) => ({
  x: round(64 + Math.cos(angle) * dist),
  y: round(64 + Math.sin(angle) * dist),
});

export function planPlate(seed: string, kind: PlateKind): PlatePlan {
  const rnd = mulberry32(hashSeed(`${kind}:${seed}`));
  const between = (lo: number, hi: number) => round(lo + rnd() * (hi - lo));
  const int = (lo: number, hi: number) => Math.floor(lo + rnd() * (hi - lo + 1));
  const shapes: PlateShape[] = [];
  const plateR = 54;

  if (kind === 'flatbread') {
    const rx = between(38, 44),
      ry = between(28, 34),
      rotate = between(-15, 15);
    shapes.push({ type: 'ellipse', cx: 64, cy: 64, rx, ry, rotate, slot: OAT });
    shapes.push({
      type: 'ellipse',
      cx: 64,
      cy: 64,
      rx: round(rx - 6),
      ry: round(ry - 6),
      rotate,
      slot: EMBER_LIGHT,
    });
    const toppings = int(5, 8);
    for (let i = 0; i < toppings; i++) {
      const p = polar(between(4, ry - 12), between(0, Math.PI * 2));
      shapes.push({
        type: 'circle',
        cx: p.x,
        cy: p.y,
        r: between(3, 6),
        slot: i % 2 === 0 ? EMBER : OLIVE,
      });
    }
    shapes.push({
      type: 'arc',
      cx: 64,
      cy: 64,
      r: round(rx - 2),
      start: between(0, 1),
      end: between(1.5, 2.5),
      width: 2,
      slot: INK,
    });
  } else if (kind === 'bowl') {
    shapes.push({ type: 'circle', cx: 64, cy: 64, r: 42, slot: INK });
    shapes.push({ type: 'circle', cx: 64, cy: 64, r: 36, slot: OLIVE_LIGHT });
    const wedges = int(3, 5);
    let angle = between(0, Math.PI * 2);
    for (let i = 0; i < wedges; i++) {
      const span = between(0.8, 1.6);
      shapes.push({
        type: 'wedge',
        cx: 64,
        cy: 64,
        r: 34,
        start: round(angle),
        end: round(angle + span),
        slot: [EMBER, OLIVE, EMBER_LIGHT, OAT][i % 4]!,
      });
      angle += span + between(0.1, 0.4);
    }
    const p = polar(between(6, 14), between(0, Math.PI * 2));
    shapes.push({ type: 'circle', cx: p.x, cy: p.y, r: between(5, 8), slot: OAT });
  } else if (kind === 'drink') {
    const rx = between(14, 18),
      ry = between(34, 40);
    shapes.push({ type: 'ellipse', cx: 64, cy: 66, rx, ry, rotate: 0, slot: EMBER_LIGHT });
    shapes.push({
      type: 'ellipse',
      cx: 64,
      cy: round(66 - ry + 8),
      rx: round(rx - 2),
      ry: 5,
      rotate: 0,
      slot: OAT,
    });
    const ice = int(2, 3);
    for (let i = 0; i < ice; i++) {
      shapes.push({
        type: 'circle',
        cx: between(58, 70),
        cy: between(50, 88),
        r: between(3, 5),
        slot: OAT,
      });
    }
    const tilt = between(-6, 6);
    shapes.push({
      type: 'stroke',
      x1: round(64 + tilt),
      y1: round(66 - ry - 4),
      x2: round(64 - tilt),
      y2: round(66 + ry - 12),
      width: 3,
      slot: INK,
    });
  } else {
    const pieces = int(4, 7);
    for (let i = 0; i < pieces; i++) {
      const p = polar(between(0, 26), between(0, Math.PI * 2));
      shapes.push({
        type: 'ellipse',
        cx: p.x,
        cy: p.y,
        rx: between(8, 14),
        ry: between(5, 8),
        rotate: between(0, 180),
        slot: [EMBER, OLIVE, EMBER_LIGHT, OLIVE_LIGHT][i % 4]!,
      });
    }
  }
  return { kind, viewBox: 128, plate: { cx: 64, cy: 64, r: plateR }, shapes };
}
