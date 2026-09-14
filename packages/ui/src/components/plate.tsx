import type { PlateKind } from '@tabletap/shared';
import type { SVGProps } from 'react';
import { planPlate, type PlateShape } from '../lib/plate-plan';
import { cn } from '../lib/utils';

const fill = (slot: number) => `var(--plate-slot-${slot})`;
const polar = (cx: number, cy: number, r: number, a: number) =>
  `${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`;
function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${polar(cx, cy, r, start)} A ${r} ${r} 0 ${large} 1 ${polar(cx, cy, r, end)}`;
}

function Shape({ s }: { s: PlateShape }) {
  switch (s.type) {
    case 'circle':
      return <circle cx={s.cx} cy={s.cy} r={s.r} fill={fill(s.slot)} />;
    case 'ellipse':
      return (
        <ellipse
          cx={s.cx}
          cy={s.cy}
          rx={s.rx}
          ry={s.ry}
          transform={`rotate(${s.rotate} ${s.cx} ${s.cy})`}
          fill={fill(s.slot)}
        />
      );
    case 'arc':
      return (
        <path
          d={arcPath(s.cx, s.cy, s.r, s.start, s.end)}
          fill="none"
          stroke={fill(s.slot)}
          strokeWidth={s.width}
          strokeLinecap="round"
        />
      );
    case 'wedge':
      return (
        <path
          d={`${arcPath(s.cx, s.cy, s.r, s.start, s.end)} L ${s.cx} ${s.cy} Z`}
          fill={fill(s.slot)}
        />
      );
    case 'stroke':
      return (
        <line
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={fill(s.slot)}
          strokeWidth={s.width}
          strokeLinecap="round"
        />
      );
  }
}

export interface PlateProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: string;
  kind: PlateKind;
  /** Defaults to `name`; pass a stable id to keep a plate identical after a rename. */
  seed?: string;
  size?: number;
  /**
   * For a plate that sits beside text already carrying the name: hidden from the accessibility
   * tree instead of read out a second time. Labelled by default, because a plate on its own is
   * the only thing standing in for the dish.
   */
  decorative?: boolean;
}

export function Plate({ name, kind, seed, size, decorative, className, ...rest }: PlateProps) {
  const plan = planPlate(seed ?? name, kind);
  return (
    <svg
      viewBox="0 0 128 128"
      {...(decorative === true ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      {...rest}
    >
      <circle
        cx={plan.plate.cx}
        cy={plan.plate.cy}
        r={plan.plate.r}
        fill="var(--plate-base)"
        stroke="var(--plate-rim)"
        strokeWidth={2}
      />
      {plan.shapes.map((s, i) => (
        <Shape key={i} s={s} />
      ))}
    </svg>
  );
}
