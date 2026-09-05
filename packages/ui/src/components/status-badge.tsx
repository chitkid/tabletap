import type { OrderStatus } from '@tabletap/shared';
import { cn } from '../lib/utils';

const LABEL: Record<OrderStatus, string> = {
  draft: 'Draft',
  placed: 'Placed',
  paid: 'Paid',
  cooking: 'Cooking',
  ready: 'Ready',
  served: 'Served',
  cancelled: 'Cancelled',
};

/**
 * Static class strings so Tailwind can see them; the foreground follows docs/design/components.md,
 * where each pairing is chosen by measured contrast against its own fill rather than by taste.
 *
 * `--primary-foreground` carries five of the six on both surfaces, because it inverts with the
 * surface in the same direction the status fills do. `cooking` is the exception the design table
 * always named: its amber is mid-dark on the guest surface, where the pale label only reaches
 * 3.58:1, and light on the kitchen board, where the pale label reaches 1.60:1. It needs dark ink in
 * both places, and the token that is dark differs by surface — hence the one `dark:` override in
 * this table. packages/ui/src/tokens.test.ts measures every pairing here on both surfaces, so a
 * class cannot change without the contrast being re-measured.
 */
export const STATUS_STYLE: Record<OrderStatus, string> = {
  draft: 'bg-muted text-foreground',
  placed: 'bg-status-placed text-primary-foreground',
  paid: 'bg-status-paid text-primary-foreground',
  cooking: 'bg-status-cooking text-foreground dark:text-primary-foreground',
  ready: 'bg-status-ready text-primary-foreground',
  served: 'bg-status-served text-primary-foreground',
  cancelled: 'bg-status-cancelled text-primary-foreground',
};

/** Colour is never the only carrier: the label is always present. */
export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(
        'inline-flex h-7 items-center rounded-full px-3 text-sm font-semibold',
        STATUS_STYLE[status],
        className,
      )}
    >
      {LABEL[status]}
    </span>
  );
}
