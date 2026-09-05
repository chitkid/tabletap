import type { DemoLinksResponse } from '@tabletap/shared';
import {
  Badge,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  Plate,
} from '@tabletap/ui';
import Link from 'next/link';
import { RushButton } from '../kitchen/rush-button';

/** The three plates in the header are the only decoration on the page. */
const PLATES = [
  { name: 'Flatbread', kind: 'flatbread' as const },
  { name: 'Grain bowl', kind: 'bowl' as const },
  { name: 'Lemonade', kind: 'drink' as const },
];

const STAFF_CARDS = [
  {
    title: 'Kitchen',
    /** `product` is what the card says with demo mode off: no sign-in is on offer then. */
    product: 'Tickets appear the moment a guest orders, on a live board.',
    demo: 'Tickets appear the moment a guest orders. Opens the live board signed in as kitchen staff.',
    href: '/login?demo=kitchen',
    cta: 'Open the kitchen display',
  },
  {
    title: 'Admin',
    product: 'Edit the menu, manage the tables, reissue a QR code and read the day.',
    demo: 'Edit the menu, the tables and the codes, and read the day. Opens the dashboard signed in as an admin.',
    // With `next`, because `/login` defaults to `/kitchen`: without it the card signs an admin in
    // and leaves them on the kitchen board, one door short of the surface it names.
    href: '/login?demo=admin&next=/admin',
    cta: 'Open the admin',
  },
];

const STEPS = [
  'Scan the QR code on the table.',
  'Pick dishes and add a note.',
  'Place the order.',
  'Follow its status on your phone.',
];

const STACK = [
  'Next.js 16',
  'Fastify 5',
  'Postgres 17 + Drizzle',
  'better-auth',
  'Tailwind 4',
  'Playwright',
  'Docker Compose',
];

/** What paying actually costs in this deployment, said before anyone presses Pay. */
function paymentNotice(links: DemoLinksResponse): string {
  const { provider, testCard } = links.payments;
  if (provider === 'demo') return 'Payments run in demo mode: no card, no money.';
  return `Payments run in Stripe test mode. Card ${testCard ?? '4242 4242 4242 4242'}, any future date, any CVC.`;
}

function resetNotice(links: DemoLinksResponse): string {
  return links.resetsEveryMinutes === null
    ? 'Demo data is not reset automatically.'
    : `Demo data resets every ${links.resetsEveryMinutes} minutes.`;
}

export function LandingContent({
  links,
  qrSvg,
  notice = null,
}: {
  links: DemoLinksResponse | null;
  qrSvg: string | null;
  /**
   * Set when demo mode is on and the links could not be built anyway - see `lib/demo-links.ts`.
   * Null both when the links are here and when there is nothing to say, so the plain product page
   * stays plain.
   */
  notice?: string | null;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-10 p-6 sm:p-10">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-4xl font-semibold">TableTap</h1>
          <p className="max-w-prose text-muted-foreground">
            Order from your table. The kitchen sees it the moment you tap.
          </p>
        </div>
        <div aria-hidden className="hidden shrink-0 items-center gap-2 sm:flex">
          {PLATES.map((plate) => (
            <Plate
              key={plate.kind}
              name={plate.name}
              kind={plate.kind}
              decorative
              className="size-12"
            />
          ))}
        </div>
      </header>

      <main className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          {/* Rendered only when there is something to say, and the page is server-rendered, so
              this is read on arrival rather than announced as a change. */}
          {links === null && notice !== null ? (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Guest</h2>
                </CardTitle>
                <CardDescription>
                  {links
                    ? `Scan the code with your phone, or open table ${links.guest.tableNumber} in this browser.`
                    : 'Scan the QR code on your table to order.'}
                </CardDescription>
              </CardHeader>
              {links && qrSvg ? (
                <CardContent>
                  {/* Local `qrcode` output, not user input: rendered as markup so the code stays
                      crisp at any size, and hidden from assistive tech behind the text below. */}
                  <div
                    aria-hidden
                    className="mx-auto w-48 [&>svg]:h-auto [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                  <p className="sr-only">{`QR code for table ${links.guest.tableNumber}`}</p>
                </CardContent>
              ) : null}
              {links ? (
                <CardFooter className="mt-auto">
                  <Link
                    href={new URL(links.guest.url).pathname}
                    className={cn(buttonVariants(), 'h-11 w-full')}
                  >
                    {`Table ${links.guest.tableNumber} as a guest`}
                  </Link>
                </CardFooter>
              ) : null}
            </Card>

            {STAFF_CARDS.map((card) => (
              <Card key={card.title}>
                <CardHeader>
                  <CardTitle>
                    <h2>{card.title}</h2>
                  </CardTitle>
                  <CardDescription>{links ? card.demo : card.product}</CardDescription>
                </CardHeader>
                {links ? (
                  <CardFooter className="mt-auto">
                    <Link
                      href={card.href}
                      className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full')}
                    >
                      {card.cta}
                    </Link>
                  </CardFooter>
                ) : null}
              </Card>
            ))}
          </div>
          {links ? <p className="text-sm text-muted-foreground">{paymentNotice(links)}</p> : null}
          {links ? <p className="text-sm text-muted-foreground">{resetNotice(links)}</p> : null}
          {links ? (
            <div className="flex flex-wrap items-center gap-3">
              <RushButton />
              <p className="text-sm text-muted-foreground">
                Twelve orders over one minute, so the board has something to do.
              </p>
            </div>
          ) : null}
        </div>

        <section aria-labelledby="how-it-works" className="flex flex-col gap-3">
          <h2 id="how-it-works" className="font-display text-xl font-semibold">
            How it works
          </h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted-foreground">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="built-with" className="flex flex-col gap-3">
          <h2 id="built-with" className="font-display text-xl font-semibold">
            Built with
          </h2>
          <ul className="flex flex-wrap gap-2">
            {STACK.map((tool) => (
              <Badge key={tool} variant="outline" asChild>
                <li>{tool}</li>
              </Badge>
            ))}
          </ul>
        </section>
      </main>

      <footer className="mt-auto text-sm text-muted-foreground">
        Source, ADRs and the case study live in the repository README.
      </footer>
    </div>
  );
}
