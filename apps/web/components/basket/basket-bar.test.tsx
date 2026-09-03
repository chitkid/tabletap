import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BasketBar } from './basket-bar';

describe('BasketBar', () => {
  it('summarises the basket in a live region and offers the sheet', () => {
    render(<BasketBar count={2} totalCents={2600} currency="USD" onOpen={() => undefined} />);
    const region = screen.getByRole('region', { name: 'Basket' });
    expect(region).toHaveTextContent('2 items · $26.00');
    expect(screen.getByRole('button', { name: 'View basket' })).toBeInTheDocument();
  });
  it('uses the singular for one item', () => {
    render(<BasketBar count={1} totalCents={400} currency="USD" onOpen={() => undefined} />);
    expect(screen.getByRole('region', { name: 'Basket' })).toHaveTextContent('1 item · $4.00');
  });
});
