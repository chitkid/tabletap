import type { TableDto } from '@tabletap/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { TablesTable } from './tables-table';

const U = (n: number) => `018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f${n.toString(16).padStart(2, '0')}`;
const table = (number: number, label: string, isActive = true): TableDto => ({
  id: U(number),
  number,
  label,
  seats: 4,
  isActive,
});

/** Deliberately out of order in the array: the screen puts them in table-number order. */
const tables: TableDto[] = [table(7, 'Terrace 7'), table(1, 'Bar 1'), table(3, 'Window 3', false)];

const rowFor = (label: string) => screen.getByText(label).closest('tr') as HTMLElement;

describe('TablesTable', () => {
  it('lists the tables in number order and says which of them is out of service', () => {
    render(<TablesTable initial={tables} fetcher={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Tables' })).toBeInTheDocument();
    const lines = screen.getAllByRole('row').map((row) => row.textContent ?? '');
    const at = (needle: string) => lines.findIndex((line) => line.includes(needle));
    expect(at('Bar 1')).toBeGreaterThan(-1);
    expect(at('Bar 1')).toBeLessThan(at('Window 3'));
    expect(at('Window 3')).toBeLessThan(at('Terrace 7'));

    expect(within(rowFor('Bar 1')).getByText('Table 1')).toBeInTheDocument();
    expect(within(rowFor('Bar 1')).getByText('Active')).toBeInTheDocument();
    expect(within(rowFor('Window 3')).getByText('Inactive')).toBeInTheDocument();
    expect(within(rowFor('Bar 1')).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
    expect(
      within(rowFor('Window 3')).getByRole('button', { name: 'Activate' }),
    ).toBeInTheDocument();
  });

  it('takes a table out of service in one press', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ table: table(7, 'Terrace 7', false) });
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Terrace 7')).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/tables/${U(7)}`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: { method: 'PATCH', body: JSON.stringify({ isActive: false }) },
    });
    expect(
      await within(rowFor('Terrace 7')).findByRole('button', { name: 'Activate' }),
    ).toBeInTheDocument();
    expect(within(rowFor('Terrace 7')).getByText('Inactive')).toBeInTheDocument();
  });

  it('puts a table back into service in one press', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ table: table(3, 'Window 3', true) });
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Window 3')).getByRole('button', { name: 'Activate' }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/tables/${U(3)}`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: { method: 'PATCH', body: JSON.stringify({ isActive: true }) },
    });
    expect(
      await within(rowFor('Window 3')).findByRole('button', { name: 'Deactivate' }),
    ).toBeInTheDocument();
  });

  it('keeps a table that has orders and says to deactivate it instead', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValue(new ApiError(409, 'IN_USE', 'This table has orders on it.'));
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Terrace 7')).getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const notice = await screen.findByText('This table has orders. Deactivate it instead.');
    expect(notice).toHaveAttribute('role', 'status');
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/tables/${U(7)}`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ init: { method: 'DELETE' } });
    expect(screen.getByLabelText('Label')).toHaveValue('Terrace 7');
  });

  it('says so when a state change is refused, beside the control that was pressed', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValue(new ApiError(409, 'CONFLICT', 'Someone else changed this table.'));
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Terrace 7')).getByRole('button', { name: 'Deactivate' }));

    const notice = await within(rowFor('Terrace 7')).findByText(
      "Couldn't save. Someone else changed this table.",
    );
    expect(notice).toHaveAttribute('role', 'status');
    expect(within(rowFor('Terrace 7')).getByText('Active')).toBeInTheDocument();
  });

  it('keeps a refused state change in view even while the reissue question stands', async () => {
    const user = userEvent.setup();
    let refuse: (error: unknown) => void = () => {};
    const inFlight = new Promise((_resolve, reject) => {
      refuse = reject;
    });
    const fetcher = vi.fn().mockReturnValueOnce(inFlight);
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Terrace 7')).getByRole('button', { name: 'Deactivate' }));
    // The question takes the row's controls away with it. The refusal is about the press before
    // it, so it has to survive that swap rather than land in a paragraph nothing is showing.
    await user.click(within(rowFor('Terrace 7')).getByRole('button', { name: 'Reissue QR' }));
    refuse(new ApiError(409, 'CONFLICT', 'Someone else changed this table.'));

    const notice = await within(rowFor('Terrace 7')).findByText(
      "Couldn't save. Someone else changed this table.",
    );
    expect(notice).toHaveAttribute('role', 'status');
    expect(
      within(rowFor('Terrace 7')).getByText(
        'Reissue the QR for table 7? Every printed code for this table stops working immediately.',
      ),
    ).toBeInTheDocument();
  });

  it('leaves focus on the toggle so a run of tables can be worked through', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ table: table(7, 'Terrace 7', false) });
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Terrace 7')).getByRole('button', { name: 'Deactivate' }));

    // The same control under the hand that pressed it: a second press re-toggles the table
    // rather than opening the editor, which is what a keyboard hand would get if focus moved.
    const toggle = await within(rowFor('Terrace 7')).findByRole('button', { name: 'Activate' });
    expect(toggle).toHaveFocus();
  });

  it('holds the row shut while a state change is still in flight', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Terrace 7')).getByRole('button', { name: 'Deactivate' }));

    // Opening the row mid-flight would let the answer land on top of whatever had been typed.
    expect(within(rowFor('Terrace 7')).getByRole('button', { name: 'Edit' })).toBeDisabled();
  });

  it('gives the label a line only when it says something the number does not', () => {
    render(<TablesTable initial={[table(4, 'Table 4'), table(5, 'Booth')]} fetcher={vi.fn()} />);

    // A restaurant that never renamed its tables should not read "Table 4" twice per row.
    expect(screen.getAllByText('Table 4')).toHaveLength(1);
    expect(screen.getByText('Booth')).toBeInTheDocument();
    expect(screen.getByText('Table 5')).toBeInTheDocument();
  });

  it('says the room is empty rather than showing a table of nothing', () => {
    render(<TablesTable initial={[]} fetcher={vi.fn()} />);
    expect(screen.getByText('No tables yet.')).toBeInTheDocument();
  });

  it('offers the printable sheet as a link the browser can download', () => {
    render(<TablesTable initial={tables} fetcher={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Print QR sheet' })).toHaveAttribute(
      'href',
      '/api/tables/qr.pdf',
    );
  });

  it('opens a new table at the next free number and posts it whole', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ table: table(8, 'Terrace 8') });
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(screen.getByRole('button', { name: 'Add table' }));
    expect(screen.getByLabelText('Number')).toHaveValue(8);
    await user.type(screen.getByLabelText('Label'), 'Terrace 8');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/tables');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: {
        method: 'POST',
        body: JSON.stringify({ number: 8, label: 'Terrace 8', seats: 4, isActive: true }),
      },
    });
    expect(await screen.findByText('Terrace 8')).toBeInTheDocument();
  });

  it('sends only what an edit changed and closes the row on what came back', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ table: table(7, 'Terrace west') });
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Terrace 7')).getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Label'));
    await user.type(screen.getByLabelText('Label'), 'Terrace west');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: { method: 'PATCH', body: JSON.stringify({ label: 'Terrace west' }) },
    });
    expect(await screen.findByText('Terrace west')).toBeInTheDocument();
  });
});
