import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';

import { cn } from '../lib/utils';

/**
 * `min-h-7` and `truncate`, not `h-7` and `overflow-hidden`.
 *
 * The pill was a fixed 28 px box that clipped a long label mid-glyph rather than ending it: no
 * ellipsis, no wrap, no scroll — the last letter simply stopped. The height is a floor now, so a
 * type scale that redefines `--text-sm` (`[data-surface="kitchen"]` does) grows the pill instead
 * of crowding the label against the rounded edge, and `truncate` keeps `whitespace-nowrap` and
 * `overflow-hidden` while adding the ellipsis that says a word was cut.
 *
 * `w-fit` means nothing is constraining it in the product today — measured, «Закончилось» draws
 * 114.06 px with 0 px clipped at 375 px and at 1280 px — so this is what the pill does when
 * something finally does constrain it, not a change to what it looks like now.
 */
const badgeVariants = cva(
  'inline-flex min-h-7 w-fit shrink-0 items-center justify-center gap-1 truncate rounded-full border border-transparent px-3 py-0.5 text-sm font-semibold transition-colors duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive [&>svg]:pointer-events-none [&>svg]:size-3',
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
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
