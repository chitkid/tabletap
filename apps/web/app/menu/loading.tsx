'use client';
import { cn } from '@tabletap/ui';
import { useTranslations } from 'next-intl';

/**
 * Six dish slots. Four of them reach the fold on a 375 x 812 phone and the other two cover a
 * taller one; past that the guest has to scroll to see a shift, and the menu has arrived by then.
 */
const CARDS = [0, 1, 2, 3, 4, 5];

/** A zero-width space: enough of a character to give a bar a line box, and nothing to read. */
const BLANK = '\u200b';

/**
 * A line of text that has not arrived yet.
 *
 * A `block` span with a zero-width space in it takes the line box of whatever type class its parent
 * carries — so a bar is exactly as tall as the line it stands in for, and stays exactly as tall if
 * the type scale ever changes. Heights are never written down here; they are inherited from the
 * same classes the real component uses.
 */
function Bar({ className }: { className?: string }) {
  return <span className={cn('block rounded bg-muted', className)}>{BLANK}</span>;
}

/**
 * A dish card's box, with its text replaced by bars.
 *
 * The classes are `components/menu/dish-card.tsx`'s own, which is the point: a card is as tall as
 * its text column (name, description, allergens, then the price row), never as tall as its 96 px
 * plate, so copying the plate's height would reserve 96 px for a 148.5 px card.
 */
function CardSlot() {
  return (
    <div className="flex gap-4 rounded-lg border border-border p-3 shadow-sm">
      <div className="size-24 shrink-0 rounded-md bg-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-display text-lg leading-tight font-semibold">
          <Bar className="w-2/3" />
        </p>
        <p className="text-sm">
          <Bar className="w-full" />
        </p>
        <p className="text-xs">
          <Bar className="w-1/3" />
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <Bar className="h-6 w-16" />
          <Bar className="h-11 w-24 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/**
 * The cold start, said out loud.
 *
 * Every block reserves the geometry the real thing will take — not the first row of it. The
 * wrapper is the menu screen's own box; the nav slot is `CategoryNav`'s own `py-2` around its own
 * `h-11` pills; the heading slot and the card slots carry the type classes their real counterparts
 * carry. `app/menu/loading.test.tsx` compares the two sources so none of that can drift apart, and
 * the numbers it adds up to were measured in a browser rather than reasoned about — see the task
 * report. No shimmer and no pulse: motion is an M6 deliverable.
 *
 * The line replaces the heading's bar rather than sitting above it: `h-9` is the line box of the
 * `text-3xl` h1 that lands there, so the words cost the page no height at all. The landing
 * used to warn about the cold start in advance; this is where that warning went — a loading state
 * that reserves its space and does not pretend to be instant.
 *
 * A Client Component on purpose. A Suspense fallback must not itself suspend, and next-intl's
 * Server Component hook reads the request config through `use()`; the provider in the root layout
 * has the messages here already.
 */
export default function MenuLoading() {
  const t = useTranslations('guest.menu');
  return (
    <div role="status" className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-28">
      <p className="flex h-9 items-center text-muted-foreground">{t('loading')}</p>
      {/* CategoryNav's box: `py-2` around a row of `h-11` pills. */}
      <div className="py-2">
        <Bar className="h-11 w-2/3 rounded-full" />
      </div>
      {/* A category section: its heading, then its dishes, at the section's own `gap-3`. */}
      <div className="flex flex-col gap-3">
        <p className="font-display text-2xl font-semibold">
          <Bar className="w-1/3" />
        </p>
        {CARDS.map((row) => (
          <CardSlot key={row} />
        ))}
      </div>
    </div>
  );
}
