import type { TableDto } from '@tabletap/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { QrActions } from './qr-actions';

const TABLE_ID = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f07';
const table: TableDto = {
  id: TABLE_ID,
  number: 7,
  label: 'Terrace 7',
  seats: 4,
  isActive: true,
};

const QUESTION =
  'Reissue the QR for table 7? Every printed code for this table stops working immediately.';
const REISSUED = 'Table 7 has a new code. Print the sheet again.';

/** The row's other controls, which the question takes away with it while it stands. */
const sibling = <button type="button">Edit</button>;

describe('QrActions', () => {
  it('asks in place rather than in a dialog, and names the table and the consequence', async () => {
    const user = userEvent.setup();
    render(
      <QrActions table={table} fetcher={vi.fn()}>
        {sibling}
      </QrActions>,
    );

    await user.click(screen.getByRole('button', { name: 'Reissue QR' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(QUESTION)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reissue QR' })).toBeNull();
    // Nothing else on the row can be pressed while the question stands.
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    // Whichever of the two the operator reaches first, the consequence is read out with it.
    const keep = screen.getByRole('button', { name: 'Keep the current code' });
    expect(keep).toHaveAccessibleDescription(QUESTION);
    expect(screen.getByRole('button', { name: 'Yes, reissue' })).toHaveAccessibleDescription(
      QUESTION,
    );
    // The safe answer is the one under the hand.
    expect(keep).toHaveFocus();
  });

  it('restores the control on Keep the current code without asking the server anything', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    render(
      <QrActions table={table} fetcher={fetcher}>
        {sibling}
      </QrActions>,
    );

    await user.click(screen.getByRole('button', { name: 'Reissue QR' }));
    await user.click(screen.getByRole('button', { name: 'Keep the current code' }));

    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reissue QR' })).toHaveFocus();
  });

  it('lets Escape out of the question the way it lets a hand out', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    render(
      <QrActions table={table} fetcher={fetcher}>
        {sibling}
      </QrActions>,
    );

    await user.click(screen.getByRole('button', { name: 'Reissue QR' }));
    await user.keyboard('{Escape}');

    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(screen.getByRole('button', { name: 'Reissue QR' })).toHaveFocus();
  });

  it('posts once on Yes, reissue and then says to print the sheet again', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ table });
    render(
      <QrActions table={table} fetcher={fetcher}>
        {sibling}
      </QrActions>,
    );

    await user.click(screen.getByRole('button', { name: 'Reissue QR' }));
    await user.click(screen.getByRole('button', { name: 'Yes, reissue' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(REISSUED));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/tables/${TABLE_ID}/qr`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ init: { method: 'POST' } });
    expect(screen.getByRole('button', { name: 'Reissue QR' })).toBeInTheDocument();
  });

  it('leaves the code alone and says so when the server refuses', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValue(new ApiError(409, 'CONFLICT', 'Someone else changed this table.'));
    render(
      <QrActions table={table} fetcher={fetcher}>
        {sibling}
      </QrActions>,
    );

    await user.click(screen.getByRole('button', { name: 'Reissue QR' }));
    await user.click(screen.getByRole('button', { name: 'Yes, reissue' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        "Couldn't reissue the code. Someone else changed this table.",
      ),
    );
    expect(screen.queryByText(REISSUED)).toBeNull();
    expect(screen.getByRole('button', { name: 'Reissue QR' })).toBeInTheDocument();
  });

  it('mounts the live region empty, before it has anything to say', async () => {
    const user = userEvent.setup();
    render(
      <QrActions table={table} fetcher={vi.fn()}>
        {sibling}
      </QrActions>,
    );
    // A row nobody has touched carries no live region at all; one appears the moment the question
    // does, empty, so the sentence that follows lands in a region a reader is already watching.
    expect(screen.queryByRole('status')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reissue QR' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
