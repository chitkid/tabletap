import { render, screen } from '@testing-library/react';
import { IntlMessageFormat } from 'intl-messageformat';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import ru from '../../messages/ru.json';
import { LandingContent } from './landing-content';

const links = {
  guest: { tableNumber: 7, url: 'http://localhost:3000/t/abc.def.ghi' },
  staff: [
    {
      role: 'kitchen' as const,
      email: 'kitchen@littlefurnace.demo',
      name: 'Тимофей Басов',
      password: 'tabletap-demo',
    },
    {
      role: 'admin' as const,
      email: 'admin@littlefurnace.demo',
      name: 'Марина Ковалёва',
      password: 'tabletap-demo',
    },
  ],
  resetsEveryMinutes: 60,
  payments: { provider: 'demo' as const, testCard: null },
};

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs
// in - unlike the real app, where this Server Component reads the request config directly, the
// file has no server/client split under Vite, so the provider is required here.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

/**
 * docs/design/02b-copy-ru.md binds a short preposition to the word after it, and a number to its
 * noun, with a non-breaking space - «стол 7», «для сотрудников». `getByRole(…, { name })` compares
 * the computed accessible name raw: dom-accessibility-api only collapses runs of two or more
 * whitespace characters, and Testing Library passes an identity normaliser for the name option, so
 * a lone U+00A0 survives to the comparison and these fixtures need the real character. The queries
 * that *do* normalise it away are `getByText` and `toHaveTextContent` - see basket-bar.test.tsx.
 * Built from its code point rather than pasted as an invisible literal, so it survives diffs.
 */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string | number>) =>
  String(new IntlMessageFormat(message, 'ru-RU').format(values));
const L = ru.landing;

describe('LandingContent', () => {
  it('does not advertise itself as a demonstration', () => {
    render(withProvider(<LandingContent links={links} />));
    for (const gone of [
      /демо-режим/i,
      /час пик/i,
      /Next\.js/,
      /репозитор/i,
      /сбрасываются/i,
      /засыпает/i,
    ]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers the guest one action and the staff a visible door', () => {
    render(withProvider(<LandingContent links={links} />));
    expect(screen.getByRole('link', { name: fill(L.guestCta, { table: 7 }) })).toHaveAttribute(
      'href',
      '/t/abc.def.ghi',
    );
    expect(screen.getByRole('link', { name: L.staffEntrance })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: L.staff.kitchen })).toHaveAttribute(
      'href',
      '/login?demo=kitchen',
    );
    // With `next`, or the door signs an admin in and drops them on the kitchen board, which is
    // what `/login` defaults to.
    expect(screen.getByRole('link', { name: L.staff.admin })).toHaveAttribute(
      'href',
      '/login?demo=admin&next=/admin',
    );
  });

  it('reads as the restaurant, headline and hours included', () => {
    render(withProvider(<LandingContent links={links} />));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(L.brand);
    // The accessible name is compared raw, U+00A0 and all - the dictionary binds «на» to «кухне»,
    // and this line failed exactly that way before the NBSP went in. Both halves of the headline,
    // because the second one alone is a sentence the first one's absence would not disturb.
    expect(
      screen.getByRole('heading', { name: `${L.hero.line1}${L.hero.line2}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: L.howItWorks.heading })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(L.howItWorks.steps);
    const hours = screen.getByRole('heading', { name: L.hours.heading });
    // `toHaveTextContent` collapses U+00A0 in the element and not in the expected string, hence
    // `plain()`; the day and its hours are asserted as the pair the page actually shows.
    expect(hours.parentElement).toHaveTextContent(
      plain(`${L.hours.weekend}${L.hours.weekendTime}`),
    );
  });

  it('puts the staff band at the foot, inverted, and keeps it there without demo mode', () => {
    for (const withLinks of [links, null]) {
      const { unmount } = render(withProvider(<LandingContent links={withLinks} />));
      const band = screen.getByRole('contentinfo');
      // The one inversion on the page. `dark` is what re-points every semantic colour token at
      // the night set (packages/ui/tokens.css); losing the class is a silent loss of the band.
      expect(band).toHaveClass('dark');
      expect(band).toHaveTextContent(plain(L.staff.heading));
      expect(band).toContainElement(screen.getByRole('link', { name: L.staff.kitchen }));
      expect(band).toContainElement(screen.getByRole('link', { name: L.staff.admin }));
      unmount();
    }
  });

  it('drops the guest action, and only that, when the demo links are missing', () => {
    render(withProvider(<LandingContent links={null} />));
    expect(screen.queryByRole('link', { name: fill(L.guestCta, { table: 7 }) })).toBeNull();
    expect(screen.getByRole('link', { name: L.staffEntrance })).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says why the guest action is missing when the API knows', () => {
    // Demo mode is on and the links still could not be built - an admin renumbered or deactivated
    // table 7. Blanking the way in and saying nothing is what this is here to stop; it is the
    // reason lib/demo-links.ts tells its two nulls apart, and this is that contract's one reader.
    const said = 'The demo landing needs an active table 7. Restore it in the admin.';
    render(withProvider(<LandingContent links={null} notice={said} />));
    expect(screen.getByRole('status')).toHaveTextContent(said);
    expect(screen.queryByRole('link', { name: fill(L.guestCta, { table: 7 }) })).toBeNull();
  });

  it('hands the page to a first-paint entrance, as its grandchildren', () => {
    const { container } = render(withProvider(<LandingContent links={links} />));
    const entrance = container.querySelector('[data-entrance="landing"]');
    expect(entrance).not.toBeNull();
    // The cascade lands on the wrapper's grandchildren, so the sections have to be exactly that.
    expect(entrance?.firstElementChild?.children).toHaveLength(3);
  });
});
