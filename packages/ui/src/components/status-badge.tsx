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

// Static class strings so Tailwind can see them; the foreground follows docs/design/components.md,
// where each pairing is chosen by measured contrast against its own fill rather than by taste.
const STYLE: Record<OrderStatus, string> = {
  draft: 'bg-muted text-foreground',
  placed: 'bg-status-placed text-primary-foreground',
  paid: 'bg-status-paid text-primary-foreground',
  cooking: 'bg-status-cooking text-foreground',
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
        STYLE[status],
        className,
      )}
    >
      {LABEL[status]}
    </span>
  );
}
