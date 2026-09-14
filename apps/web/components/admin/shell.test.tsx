import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ru from '../../messages/ru.json';
import { AdminShell } from './shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/menu' }));

/** Every word of the operator's chrome comes from `messages/ru.json`, never from this file. */
const withIntl = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: withIntl });

const A = ru.admin;

function renderShell(onSignOut = vi.fn()) {
  render(
    <AdminShell restaurantName="Little Furnace" staffName="Ада Байрон" onSignOut={onSignOut}>
      <p>Рабочая область</p>
    </AdminShell>,
  );
  return onSignOut;
}

describe('AdminShell', () => {
  it('offers the three admin sections and marks the one being viewed', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: A.sections });
    const menu = within(nav).getByRole('link', { name: A.nav.menu });
    expect(menu).toHaveAttribute('href', '/admin/menu');
    expect(menu).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: A.nav.tables })).toHaveAttribute(
      'href',
      '/admin/tables',
    );
    expect(within(nav).getByRole('link', { name: A.nav.dashboard })).toHaveAttribute(
      'href',
      '/admin/dashboard',
    );
    expect(within(nav).getByRole('link', { name: A.nav.tables })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('names the restaurant and the signed-in admin, and renders the working area', () => {
    renderShell();
    expect(screen.getByRole('banner')).toHaveTextContent('Little Furnace');
    expect(screen.getByRole('banner')).toHaveTextContent('Ада Байрон');
    expect(screen.getByRole('main')).toHaveTextContent('Рабочая область');
  });

  it('gives a keyboard a way past the sidebar, in words', () => {
    renderShell();
    expect(screen.getByRole('link', { name: A.skipToContent })).toHaveAttribute(
      'href',
      '#admin-content',
    );
  });

  it('signs out through the injected sign-out', async () => {
    const user = userEvent.setup();
    const onSignOut = renderShell();
    await user.click(screen.getByRole('button', { name: A.signOut }));
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });
});
