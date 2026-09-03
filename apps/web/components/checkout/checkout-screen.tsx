'use client';
import { IDEMPOTENCY_KEY_HEADER, OrderDtoSchema, type MenuResponse } from '@tabletap/shared';
import { Button, Label, Textarea } from '@tabletap/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ApiError, clientFetch } from '../../lib/api';
import {
  cartLines,
  cartTotalCents,
  countItems,
  readCart,
  toOrderItems,
  useCart,
  type CartLine,
} from '../../lib/cart';
import { formatCents } from '../../lib/money';
import { randomUuid } from '../../lib/uuid';

const NOTE_MAX_LENGTH = 280;
const NOTE_COUNTER_ID = 'note-counter';

const SOLD_OUT_LINE = 'Sold out today. Remove it to continue.';
const SOLD_OUT_SOME = 'Some items are sold out today. Remove them to continue.';
const UNREACHABLE = "Can't reach the server. Check the connection and try again.";
const TOO_MANY = 'Too many orders in a minute. Wait a moment and try again.';
const MESSAGE: Record<string, string> = {
  ITEM_UNAVAILABLE: SOLD_OUT_SOME,
  VALIDATION_FAILED: 'Something in the basket is not right. Go back to the menu.',
  RATE_LIMITED: TOO_MANY,
  CONFLICT: 'This basket was already sent from another table. Go back to the menu and start again.',
};

function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return UNREACHABLE;
  // A bare 429 from a proxy in front of the API carries no envelope, so the status is the
  // second witness for the one failure a guest is most likely to cause themselves.
  return MESSAGE[err.code] ?? (err.status === 429 ? TOO_MANY : UNREACHABLE);
}

/** Only the ids are read here: the names on screen come from the menu the guest is looking at. */
const UnavailableDetailsSchema = z.object({
  unavailable: z.array(z.object({ menuItemId: z.string().min(1) })),
});

/**
 * The confirmation page loads the order itself, so the reply to the POST is read for one field.
 * Picking it off the contract keeps the id validated without making a placed order look like a
 * network failure whenever the DTO grows a field this page never touches.
 */
const PlacedOrderSchema = z.object({ order: OrderDtoSchema.pick({ id: true }) });

export function CheckoutScreen({ menu, tableId }: { menu: MenuResponse; tableId: string }) {
  const router = useRouter();
  const { cart, remove, clear } = useCart(tableId);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(() => new Set());

  // `useRouter()` may hand back a fresh object on any render; naming it as an effect dependency
  // would re-run the redirect below on every keystroke in the note.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const count = countItems(cart);
  // Placing an order empties the basket, which is the same shape as arriving with an empty one.
  // Without this the success redirect would be overtaken by a bounce back to the menu.
  const placed = useRef(false);
  // The basket is read from storage rather than from `count` here, and the difference is the
  // hydration commit: the store answers with the empty server snapshot until it has settled, and
  // a redirect fired from that answer would send a guest with a full basket back to the menu.
  // `count` is only the trigger — it changes whenever the basket does, including on that commit.
  useEffect(() => {
    if (placed.current || countItems(readCart(tableId)) > 0) return;
    routerRef.current.replace('/menu');
  }, [count, tableId]);

  /**
   * One key per checkout visit, so a retry after a timeout or a sold-out line replays the first
   * order instead of placing a second one. `sessionStorage` carries it across a reload; the ref
   * carries it when storage is unavailable, which is the case that would otherwise mint a new
   * key on every attempt — exactly when idempotency matters most.
   */
  const idempotencyKey = useRef<string | null>(null);
  const storageKey = `tt-idem:${tableId}`;
  const takeIdempotencyKey = useCallback(() => {
    if (idempotencyKey.current !== null) return idempotencyKey.current;
    let key: string | null = null;
    try {
      key = sessionStorage.getItem(storageKey);
    } catch {
      key = null;
    }
    key ??= randomUuid();
    try {
      sessionStorage.setItem(storageKey, key);
    } catch {
      // storage unavailable: the ref keeps the key for this page load
    }
    idempotencyKey.current = key;
    return key;
  }, [storageKey]);

  const lines = cartLines(cart, menu);
  const currency = menu.restaurant.currency;
  // The menu snapshot is one answer and the last reply from the server is a fresher one: an item
  // can sell out between the page load and the tap on Place order.
  const isSoldOut = (line: CartLine) => !line.available || flagged.has(line.menuItemId);
  const blocked = lines.some(isSoldOut);
  const orderable = lines.filter((line) => !isSoldOut(line));

  async function placeOrder() {
    setSubmitting(true);
    setMessage(null);
    setFlagged(new Set());
    const trimmed = note.trim();
    try {
      const { order } = await clientFetch('/api/orders', {
        schema: PlacedOrderSchema,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [IDEMPOTENCY_KEY_HEADER]: takeIdempotencyKey(),
          },
          body: JSON.stringify({
            items: toOrderItems(cart, menu),
            ...(trimmed ? { note: trimmed } : {}),
          }),
        },
      });
      // The basket is emptied only once the kitchen has the order, and the key is spent with it:
      // the next visit to the checkout is a new order, not a replay of this one.
      placed.current = true;
      clear();
      idempotencyKey.current = null;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // nothing to forget
      }
      // Left busy on purpose: the button must not offer to place an order that is already placed.
      routerRef.current.replace(`/orders/${order.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        routerRef.current.replace('/session-ended');
        return;
      }
      setSubmitting(false);
      if (err instanceof ApiError && err.code === 'ITEM_UNAVAILABLE') {
        const details = UnavailableDetailsSchema.safeParse(err.details);
        if (details.success)
          setFlagged(new Set(details.data.unavailable.map((item) => item.menuItemId)));
      }
      setMessage(messageFor(err));
    }
  }

  if (count === 0) return null;

  // A sold-out line always has a way out of the dead end it creates: the line says what to do,
  // and the message beside the disabled button says it again for anyone who never saw the line.
  const status = message ?? (blocked ? SOLD_OUT_SOME : '');

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <h1 className="font-display text-3xl font-semibold">Your order</h1>

      <section
        aria-labelledby="checkout-lines-heading"
        className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm"
      >
        <h2 id="checkout-lines-heading" className="sr-only">
          What you are ordering
        </h2>
        <ul>
          {lines.map((line) => (
            <CheckoutLine
              key={line.menuItemId}
              line={line}
              currency={currency}
              soldOut={isSoldOut(line)}
              onRemove={() => remove(line.menuItemId)}
            />
          ))}
        </ul>
        <div className="flex items-baseline justify-between gap-3 pt-3 font-semibold">
          <span>Total</span>
          <span>{formatCents(cartTotalCents(cart, menu), currency)}</span>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Note for the kitchen</Label>
        <Textarea
          id="note"
          name="note"
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          aria-describedby={NOTE_COUNTER_ID}
          onChange={(event) => setNote(event.target.value)}
        />
        <p id={NOTE_COUNTER_ID} className="text-sm text-muted-foreground">
          {`${note.length} / ${NOTE_MAX_LENGTH}`}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button
          type="button"
          disabled={submitting || blocked || orderable.length === 0}
          aria-busy={submitting || undefined}
          onClick={() => void placeOrder()}
        >
          {submitting ? 'Sending to the kitchen…' : 'Place order'}
        </Button>
        {/* Always in the layout, empty when there is nothing to say: a paragraph that appears
            only on failure moves the button under the thumb that just pressed it. */}
        <p role="status" aria-live="polite" className="min-h-6">
          {status}
        </p>
      </div>
    </main>
  );
}

function CheckoutLine({
  line,
  currency,
  soldOut,
  onRemove,
}: {
  line: CartLine;
  currency: string;
  soldOut: boolean;
  onRemove: () => void;
}) {
  const name = line.item?.name ?? null;
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span>{name === null ? 'No longer on the menu' : `${line.quantity} × ${name}`}</span>
        {line.item !== null ? (
          <span className="font-semibold">{formatCents(line.lineTotalCents, currency)}</span>
        ) : null}
      </div>
      {soldOut ? (
        <div className="flex items-center justify-between gap-3">
          {/* The instruction sits on the line it is about, not only in the summary above the
              button: the guest reads down the basket, and this is where the problem is. A line
              whose dish has left the menu says so in place of its name and needs no second
              sentence — "sold out today" would be the wrong reason. */}
          {name === null ? <span /> : <p className="text-sm">{SOLD_OUT_LINE}</p>}
          <Button
            type="button"
            variant="ghost"
            aria-label={`Remove ${name ?? 'this item'}`}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      ) : null}
    </li>
  );
}
