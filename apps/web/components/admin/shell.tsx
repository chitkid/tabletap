'use client';
import { Button, Mark, cn } from '@tabletap/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { authClient } from '../../lib/auth-client';

/**
 * The contract the later admin pages are built against: three sections, in this order. The word
 * lives in `admin.nav`, keyed by the last segment of the route — the module holds the structure
 * and the dictionary holds the language, which is the split `lib/board-store.ts` made for the
 * kitchen's columns.
 */
const SECTIONS = [
  { href: '/admin/menu', key: 'menu' },
  { href: '/admin/tables', key: 'tables' },
  { href: '/admin/dashboard', key: 'dashboard' },
] as const;

async function signOut(): Promise<void> {
  await authClient.signOut();
  // A full document load rather than a router push: the session cookie every server component
  // reads has just been destroyed, and the router's cache still holds pages rendered for it.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/login');
}

/**
 * The operator's chrome: a sidebar, a top bar and a working area. No centred column and no
 * marketing rhythm — the restaurant's own brand belongs to the guest surface, and this is the
 * tool. Density comes from the grid and the type scale; every control keeps its full height.
 */
export function AdminShell({
  restaurantName,
  staffName,
  children,
  onSignOut = signOut,
}: {
  restaurantName: string;
  staffName: string;
  children: ReactNode;
  onSignOut?: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const t = useTranslations('admin');

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a
        href="#admin-content"
        className="sr-only rounded-md bg-card px-3 py-2 text-sm font-semibold underline underline-offset-4 focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:shadow-md"
      >
        {t('skipToContent')}
      </a>
      <nav
        aria-label={t('sections')}
        className="shrink-0 border-b border-border/60 bg-secondary px-3 py-3 md:w-56 md:border-r md:border-b-0 md:py-4"
      >
        <p className="flex items-center gap-2 px-2 font-display text-lg font-semibold tracking-tight">
          <Mark className="size-5" />
          TableTap
        </p>
        <ul className="mt-3 flex flex-row gap-1 overflow-x-auto md:mt-6 md:flex-col md:overflow-visible">
          {SECTIONS.map((section) => {
            const current = pathname === section.href;
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'flex h-11 items-center rounded-md px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-secondary',
                    current
                      ? 'bg-card font-semibold shadow-sm'
                      : 'font-medium hover:bg-card/70 md:justify-start',
                  )}
                >
                  {t(`nav.${section.key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/60 bg-card px-4 py-2 md:px-6">
          <p className="truncate font-display text-base font-semibold">{restaurantName}</p>
          <div className="flex items-center gap-3">
            <span className="truncate text-sm text-muted-foreground">{staffName}</span>
            <Button type="button" variant="ghost" onClick={() => void onSignOut()}>
              {t('signOut')}
            </Button>
          </div>
        </header>
        <main
          id="admin-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 outline-none md:px-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
