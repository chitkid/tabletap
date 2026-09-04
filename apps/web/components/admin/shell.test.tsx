import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminShell } from './shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/menu' }));

function renderShell(onSignOut = vi.fn()) {
  render(
    <AdminShell restaurantName="Little Furnace" staffName="Ada Byron" onSignOut={onSignOut}>
      <p>The working area</p>
    </AdminShell>,
  );
  return onSignOut;
}

describe('AdminShell', () => {
  it('offers the three admin sections and marks the one being viewed', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Admin sections' });
    const menu = within(nav).getByRole('link', { name: 'Menu' });
    expect(menu).toHaveAttribute('href', '/admin/menu');
    expect(menu).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Tables' })).toHaveAttribute(
      'href',
      '/admin/tables',
    );
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/admin/dashboard',
    );
    expect(within(nav).getByRole('link', { name: 'Tables' })).not.toHaveAttribute('aria-current');
  });

  it('names the restaurant and the signed-in admin, and renders the working area', () => {
    renderShell();
    expect(screen.getByRole('banner')).toHaveTextContent('Little Furnace');
    expect(screen.getByRole('banner')).toHaveTextContent('Ada Byron');
    expect(screen.getByRole('main')).toHaveTextContent('The working area');
  });

  it('signs out through the injected sign-out', async () => {
    const user = userEvent.setup();
    const onSignOut = renderShell();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });
});
