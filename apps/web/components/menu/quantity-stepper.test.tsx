import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from './quantity-stepper';

describe('QuantityStepper', () => {
  it('labels both buttons with the dish name and shows the value', async () => {
    const onChange = vi.fn();
    render(<QuantityStepper name="Margherita Flatbread" value={2} onChange={onChange} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Add one more Margherita Flatbread' }),
    );
    expect(onChange).toHaveBeenCalledWith(3);
    await userEvent.click(screen.getByRole('button', { name: 'Remove one Margherita Flatbread' }));
    expect(onChange).toHaveBeenCalledWith(1);
    // The basket bar announces the totals; a live count on every card would make one tap
    // speak twice.
    expect(screen.getByText('2')).not.toHaveAttribute('aria-live');
  });
  it('disables plus at the maximum', () => {
    render(<QuantityStepper name="x" value={20} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Add one more x' })).toBeDisabled();
  });
});
