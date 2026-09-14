import type { DemoLinksResponse } from '@tabletap/shared';
import { buttonVariants, cn, Plate } from '@tabletap/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Entrance } from '../entrance';

/**
 * The three plates beside the headline are the only decoration on the page.
 *
 * `seed` is pinned and `name` is not what draws them: `planPlate` takes `seed ?? name`, so the
 * English seeds keep these three shapes byte-identical to what the page has always drawn while the
 * names read as the rest of the product does. The names are unread here — the row is `aria-hidden`
 * and each plate is `decorative` — but `Plate` is the same component that labels a dish when it
 * stands alone, and a Latin `name` on it is a Latin accessible name one prop away.
 */
const PLATES = [
  { name: 'Лепёшка', seed: 'Flatbread', kind: 'flatbread' as const },
  { name: 'Миска с крупой', seed: 'Grain bowl', kind: 'bowl' as const },
  { name: 'Лимонад', seed: 'Lemonade', kind: 'drink' as const },
];

/**
 * Literal keys rather than a template built in the loop: with no `IntlMessages` augmentation the
 * key type is only as narrow as what is written here, and a pair that loses its partner should be
 * a compile error at this list rather than a missing-message warning in the browser.
 */
const HOURS = [
  ['hours.weekdays', 'hours.weekdaysTime'],
  ['hours.weekend', 'hours.weekendTime'],
  ['hours.sunday', 'hours.sundayTime'],
] as const;

/**
 * The two staff doors carry `demo` so the seeded accounts still open them in one press on the
 * public deployment; with demo mode off the parameter finds no account and `/login` is a plain
 * sign-in form, which is what «Вход по учётной записи» promises either way. Admin needs `next`
 * as well, or it signs an admin in and leaves them on the kitchen board — `/login`'s default.
 */
const STAFF_DOORS = [
  { key: 'staff.kitchen', href: '/login?demo=kitchen', variant: 'default' } as const,
  { key: 'staff.admin', href: '/login?demo=admin&next=/admin', variant: 'outline' } as const,
];

export function LandingContent({
  links,
  notice = null,
}: {
  links: DemoLinksResponse | null;
  /**
   * Set when demo mode is on and the links could not be built anyway - see `lib/demo-links.ts`.
   * Null both when the links are here and when there is nothing to say, so the page stays a
   * restaurant's page. This is the only reader of that two-null distinction: without it the one
   * way in disappears and nothing on the page says why.
   */
  notice?: string | null;
}) {
  const t = useTranslations('landing');
  // `t.raw` is next-intl's escape hatch for a message that is a list rather than a string. Its
  // return is untyped, so the shape is named once here instead of at the point of use.
  const steps: string[] = t.raw('howItWorks.steps');

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 p-6 sm:p-10">
        <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">{t('brand')}</h1>
          {/* Underlined, not coloured only: colour alone is not a distinction (WCAG 1.4.1), and
              this is the half of the staff entrance that has to be legible at the top of a page
              a guest is meant to read past. */}
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: 'link' }), 'h-auto px-0 underline')}
          >
            {t('staffEntrance')}
          </Link>
        </header>

        <main className="flex flex-col gap-10">
          {/* Rendered only when there is something to say, and the page is server-rendered, so
              this is read on arrival rather than announced as a change. */}
          {links === null && notice !== null ? (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          ) : null}

          {/* Three sections, and they arrive one after another on the first paint of this route —
              see components/entrance.tsx. The cascade lands on this wrapper's grandchildren, so
              the count here is the count that stays whether or not the demo links answered. */}
          <Entrance route="landing">
            <div className="flex flex-col gap-12">
              <section
                aria-labelledby="hero-heading"
                className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex max-w-prose flex-col gap-4">
                  <h2 id="hero-heading" className="font-display text-4xl font-semibold sm:text-5xl">
                    <span className="block">{t('hero.line1')}</span>
                    <span className="block">{t('hero.line2')}</span>
                  </h2>
                  <p className="text-muted-foreground">{t('hero.subtitle')}</p>
                  {links ? (
                    <Link
                      href={new URL(links.guest.url).pathname}
                      className={cn(buttonVariants(), 'w-full sm:w-auto sm:self-start')}
                    >
                      {t('guestCta', { table: links.guest.tableNumber })}
                    </Link>
                  ) : null}
                </div>
                <div aria-hidden className="hidden shrink-0 items-center gap-2 sm:flex">
                  {PLATES.map((plate) => (
                    <Plate
                      key={plate.kind}
                      name={plate.name}
                      seed={plate.seed}
                      kind={plate.kind}
                      decorative
                      className="size-12"
                    />
                  ))}
                </div>
              </section>

              <section aria-labelledby="how-it-works" className="flex flex-col gap-3">
                <h2 id="how-it-works" className="font-display text-xl font-semibold">
                  {t('howItWorks.heading')}
                </h2>
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted-foreground">
                  {steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>

              <section aria-labelledby="hours-heading" className="flex flex-col gap-3">
                <h2 id="hours-heading" className="font-display text-xl font-semibold">
                  {t('hours.heading')}
                </h2>
                <dl className="flex flex-col gap-2 text-muted-foreground">
                  {HOURS.map(([days, time]) => (
                    <div key={days} className="flex flex-wrap gap-x-4">
                      <dt className="min-w-56">{t(days)}</dt>
                      <dd>{t(time)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          </Entrance>
        </main>
      </div>

      {/* The back of house, and the only inversion on the page: `dark` re-points every semantic
          colour token at the night set (packages/ui/tokens.css), so the band is built out of the
          same `bg-background` / `text-foreground` pair as the rest of the product rather than out
          of colours of its own. Not `data-surface="kitchen"`, which would also pull in the
          kitchen's across-the-room type scale and, through globals.css, repaint the page canvas.
          Measured against the tokens it lands on: 16.5:1 for the heading and its controls' labels,
          8.6:1 for the muted line, 5.9:1 for the filled door and its boundary against the band,
          3.7:1 for the outlined door's border. Nothing here is gated on the demo links, so the
          band occupies the same box on every render and the staff entrance is never missing. */}
      <footer
        aria-labelledby="staff-heading"
        className="dark bg-background text-foreground print:hidden"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6 sm:p-10">
          <h2 id="staff-heading" className="font-display text-xl font-semibold">
            {t('staff.heading')}
          </h2>
          <p className="max-w-prose text-muted-foreground">{t('staff.text')}</p>
          <div className="flex flex-wrap gap-3">
            {STAFF_DOORS.map((door) => (
              <Link
                key={door.href}
                href={door.href}
                className={cn(buttonVariants({ variant: door.variant }), 'w-full sm:w-auto')}
              >
                {t(door.key)}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
