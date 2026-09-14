import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';

import { cn } from '../lib/utils';

/**
 * `min-h-7`, not `h-7`: the height is a floor, so a type scale that redefines `--text-sm`
 * (`[data-surface="kitchen"]` does) grows the pill instead of crowding the label against its
 * rounded edge.
 *
 * `truncate` does not live here. `text-overflow` only has a box to act on inside a block
 * container's own inline content, and this container is `inline-flex` — flex layout has no line
 * boxes, so `truncate` on the flex container itself clips both ends of the label instead of
 * ellipsising one. **Measured**, two badges forced to 70 px wide in the product's own stylesheet
 * and fonts (`admin/menu`, live, «Закончилось»): with `truncate` on this container, content needs
 * 90 px against a 68 px content box and renders `аконьчилос` — the first letter cut too, no `…`.
 * The label span below carries `truncate` instead: same 70 px outer box, its own 44 px content
 * box against the label's 88 px, and it renders `Зак…`.
 *
 * `overflow-hidden` stays on the pill regardless, as a second line of defence (an oversized icon,
 * say). `w-fit` means nothing constrains the pill in the product today.
 */
const badgeVariants = cva(
  'inline-flex min-h-7 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-3 py-0.5 text-sm font-semibold transition-colors duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'bg-destructive text-primary-foreground focus-visible:ring-destructive [a&]:hover:bg-destructive/90',
        outline:
          'border-border text-foreground [a&]:hover:bg-secondary [a&]:hover:text-secondary-foreground',
        ghost: '[a&]:hover:bg-secondary [a&]:hover:text-secondary-foreground',
        link: 'text-primary underline-offset-4 [a&]:hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  children,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {/*
       * `asChild` hands its single child element straight to `Slot`, which clones that element and
       * merges these props onto it — wrapping `children` here would make `Slot` merge onto the
       * wrapper instead of the caller's own element, breaking `asChild`. Every current call site
       * (`menu-row.tsx:138`, `tables-table.tsx:280`) takes the plain-`span` path with a bare string
       * child, so that is the one that gets the truncating slot: `min-w-0` lets the label shrink
       * below its natural width instead of the flex item default (`min-width: auto`) holding the
       * pill open, and becoming a flex item blockifies this span, giving `truncate` a real block
       * box with inline content to act on.
       */}
      {asChild ? children : <span className="min-w-0 truncate">{children}</span>}
    </Comp>
  );
}

export { Badge, badgeVariants };
