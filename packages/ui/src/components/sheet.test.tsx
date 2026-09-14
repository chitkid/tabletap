// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sheet, SheetContent, SheetTitle } from './sheet';

/**
 * The corner close button used to be a boolean with `aria-label="Close"` compiled in, which put
 * an English name on a control in a Russian product without any surface asking for it. This
 * package has no dictionary and cannot get one — it is shared, and the word for «закрыть» differs
 * with what is being closed — so the name comes from the caller or the control does not exist.
 * Same rule as `StatusBadge`'s required `label`.
 */
describe('SheetContent’s close button', () => {
  it('is named by its caller, in the caller’s language', () => {
    render(
      <Sheet open>
        <SheetContent closeLabel="Закрыть корзину">
          <SheetTitle>Ваша корзина</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('button', { name: 'Закрыть корзину' })).not.toBeNull();
  });
  it('is not drawn at all when no caller named it, rather than falling back to a word of its own', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Ваша корзина</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    // Radix's own dismiss handlers stay; what is gone is the button and the name on it. A sheet
    // that closes from its own footer says what closing means, which a bare × cannot.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
