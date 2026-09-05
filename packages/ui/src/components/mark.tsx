import type { SVGProps } from 'react';
import { cn } from '../lib/utils';

export interface MarkProps extends SVGProps<SVGSVGElement> {
  /** Omit on chrome that already names the product in text beside the mark. */
  title?: string;
}

/**
 * TableTap's mark: an open ring — a tabletop seen from above, its gap at the lower
 * right — with a solid ember dot at the centre. Kitchen and admin chrome only; the
 * guest surface wears Little Furnace and nothing else (docs/brand-guidelines.md §3).
 *
 * The geometry is duplicated as literal values in `apps/web/app/icon.svg`, because a
 * favicon has no CSS context to resolve `currentColor` or `var(--primary)` against.
 * Change the ring or dot here, change it there too.
 */
export function Mark({ title, className, ...rest }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      {...(title !== undefined ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
      className={cn('shrink-0', className)}
      {...rest}
    >
      <circle
        cx={32}
        cy={32}
        r={22}
        fill="none"
        stroke="currentColor"
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray="110 28"
        transform="rotate(28 32 32)"
      />
      <circle cx={32} cy={32} r={8.5} fill="var(--primary)" />
    </svg>
  );
}
