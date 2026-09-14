import type { DashboardResponse } from '@tabletap/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardTiles } from './dashboard-tiles';

const today: DashboardResponse['today'] = {
  orders: 42,
  revenueCents: 128_450,
  averageReadyMs: 432_000,
  openTickets: 3,
};

const tileFor = (label: string) => screen.getByText(label).closest('div') as HTMLElement;

describe('DashboardTiles', () => {
  it('shows the four figures the day is judged on', () => {
    render(<DashboardTiles today={today} currency="USD" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(within(tileFor('Orders')).getByText('42')).toBeInTheDocument();
    expect(within(tileFor('Revenue')).getByText('1 285 $')).toBeInTheDocument();
    expect(within(tileFor('Average time to ready')).getByText('7m 12s')).toBeInTheDocument();
    expect(within(tileFor('Open tickets')).getByText('3')).toBeInTheDocument();
  });

  it("counts the money in the restaurant's own currency, not in dollars", () => {
    render(<DashboardTiles today={today} currency="EUR" />);
    expect(within(tileFor('Revenue')).getByText('1 285 €')).toBeInTheDocument();
    expect(screen.queryByText('1 285 $')).toBeNull();
  });

  it('reads a sub-minute average in seconds alone', () => {
    render(<DashboardTiles today={{ ...today, averageReadyMs: 47_400 }} currency="USD" />);
    expect(within(tileFor('Average time to ready')).getByText('47s')).toBeInTheDocument();
  });

  it('says in words that nothing reached ready, rather than printing a zero', () => {
    render(<DashboardTiles today={{ ...today, averageReadyMs: null }} currency="USD" />);

    const tile = tileFor('Average time to ready');
    const dash = within(tile).getByText('—');
    expect(dash).toHaveAttribute('aria-hidden', 'true');
    expect(within(tile).getByText('No order reached ready today.')).toBeInTheDocument();
    expect(within(tile).queryByText('0s')).toBeNull();
  });
});
