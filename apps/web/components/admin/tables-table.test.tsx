import type { TableDto } from '@tabletap/shared';
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import ru from '../../messages/ru.json';
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
const tables: TableDto[] = [table(7, 'Терраса 7'), table(1, 'Бар 1'), table(3, 'У окна 3', false)];

const withIntl = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: withIntl });

/**
 * Fixtures are composed from `messages/ru.json`. `getByRole(…, { name })` matches with an identity
 * normaliser, so «Стол 7»'s U+00A0 has to be the real byte there; `getByText` collapses it, which
 * is what `plain` is for.
 */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string | number>) =>
  message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
const TB = ru.admin.tables;
const Q = ru.admin.qr;
const ACT = ru.admin.actions;
const R = ru.admin.refusal;
const E = ru.errors;

const named = (number: number) => plain(fill(TB.table, { number }));
const rowFor = (label: string) => screen.getByText(label).closest('tr') as HTMLElement;

describe('TablesTable', () => {
  it('lists the tables in number order and says which of them is out of service', () => {
    render(<TablesTable initial={tables} fetcher={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: TB.heading })).toBeInTheDocument();
    const lines = screen.getAllByRole('row').map((row) => row.textContent ?? '');
    const at = (needle: string) => lines.findIndex((line) => line.includes(needle));
    expect(at('Бар 1')).toBeGreaterThan(-1);
    expect(at('Бар 1')).toBeLessThan(at('У окна 3'));
    expect(at('У окна 3')).toBeLessThan(at('Терраса 7'));

    expect(within(rowFor('Бар 1')).getByText(named(1))).toBeInTheDocument();
    expect(within(rowFor('Бар 1')).getByText(plain(TB.active))).toBeInTheDocument();
    expect(within(rowFor('У окна 3')).getByText(plain(TB.inactive))).toBeInTheDocument();
    expect(
      within(rowFor('Бар 1')).getByRole('button', { name: TB.deactivate }),
    ).toBeInTheDocument();
    expect(
      within(rowFor('У окна 3')).getByRole('button', { name: TB.activate }),
    ).toBeInTheDocument();
  });

  it('heads its columns in the operator’s language, and names the controls column for a reader', () => {
    render(<TablesTable initial={tables} fetcher={vi.fn()} />);
    /**
     * Singular, like the menu's: a table column head names the **field in each row**, and each
     * row is one table. The kitchen board's plural headings are a different position — a heading
     * over a *group* of tickets — and no status word heads a column here, so the split
     * `kitchen-board.tsx` and `ticket-card.tsx` hold between them does not arise on this surface.
     */
    for (const heading of [TB.columns.table, TB.columns.seats, TB.columns.state])
      expect(screen.getByRole('columnheader', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: ru.admin.rowControls })).toBeInTheDocument();
    expect(screen.getByText(plain(TB.caption))).toBeInTheDocument();
  });

  it('takes a table out of service in one press', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ table: table(7, 'Терраса 7', false) });
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Терраса 7')).getByRole('button', { name: TB.deactivate }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/tables/${U(7)}`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: { method: 'PATCH', body: JSON.stringify({ isActive: false }) },
    });
    expect(
      await within(rowFor('Терраса 7')).findByRole('button', { name: TB.activate }),
    ).toBeInTheDocument();
    expect(within(rowFor('Терраса 7')).getByText(plain(TB.inactive))).toBeInTheDocument();
  });

  it('puts a table back into service in one press', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ table: table(3, 'У окна 3', true) });
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('У окна 3')).getByRole('button', { name: TB.activate }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/tables/${U(3)}`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: { method: 'PATCH', body: JSON.stringify({ isActive: true }) },
    });
    expect(
      await within(rowFor('У окна 3')).findByRole('button', { name: TB.deactivate }),
    ).toBeInTheDocument();
  });

  it('keeps a table that has orders and says to deactivate it instead', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValue(
        new ApiError(409, 'IN_USE', 'tableInUse', 'This table has orders. Deactivate it instead.'),
      );
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Терраса 7')).getByRole('button', { name: ACT.edit }));
    await user.click(screen.getByRole('button', { name: ACT.delete }));

    // `findByText` is an exact match on the whole normalised text, not a substring one, so it
    // already fails on the «Не удалось удалить. » frame that `refuseDelete`'s removal would add -
    // which is why this guard kept its teeth where menu-row's and menu-table's lost theirs. The
    // `not.toContain(<English>)` that used to follow could never have been the line that failed.
    const notice = await screen.findByText(plain(TB.inUse));
    expect(notice).toHaveAttribute('role', 'status');
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/tables/${U(7)}`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ init: { method: 'DELETE' } });
    expect(screen.getByLabelText(TB.label)).toHaveValue('Терраса 7');
  });

  it('says so when a state change is refused, beside the control that was pressed', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          409,
          'CONFLICT',
          'tableChanged',
          'This table changed while you were editing it. Reload and try again.',
        ),
      );
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Терраса 7')).getByRole('button', { name: TB.deactivate }));

    // Named for the press that was refused, not for a save: this control opens no editor. Every
    // word is the dictionary's - the frame and the verb from `admin.refusal`, the second half
    // resolved from the refusal's key - and the API's English sentence stays in the log.
    const notice = await within(rowFor('Терраса 7')).findByText(
      plain(
        fill(R.withReason, {
          verb: R.verb.deactivate,
          message: E.tableChanged,
        }),
      ),
    );
    expect(notice).toHaveAttribute('role', 'status');
    expect(within(rowFor('Терраса 7')).getByText(plain(TB.active))).toBeInTheDocument();
  });

  it('names the other direction of the same press when putting a table back is refused', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          409,
          'CONFLICT',
          'tableChanged',
          'This table changed while you were editing it. Reload and try again.',
        ),
      );
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('У окна 3')).getByRole('button', { name: TB.activate }));

    const notice = await within(rowFor('У окна 3')).findByText(
      plain(fill(R.withReason, { verb: R.verb.activate, message: E.tableChanged })),
    );
    expect(notice).toHaveAttribute('role', 'status');
  });

  it('keeps a refused state change in view even while the reissue question stands', async () => {
    const user = userEvent.setup();
    let refuse: (error: unknown) => void = () => {};
    const inFlight = new Promise((_resolve, reject) => {
      refuse = reject;
    });
    const fetcher = vi.fn().mockReturnValueOnce(inFlight);
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Терраса 7')).getByRole('button', { name: TB.deactivate }));
    // The question takes the row's controls away with it. The refusal is about the press before
    // it, so it has to survive that swap rather than land in a paragraph nothing is showing.
    await user.click(within(rowFor('Терраса 7')).getByRole('button', { name: Q.reissue }));
    refuse(
      new ApiError(
        409,
        'CONFLICT',
        'tableChanged',
        'This table changed while you were editing it. Reload and try again.',
      ),
    );

    const notice = await within(rowFor('Терраса 7')).findByText(
      plain(
        fill(R.withReason, {
          verb: R.verb.deactivate,
          message: E.tableChanged,
        }),
      ),
    );
    expect(notice).toHaveAttribute('role', 'status');
    expect(
      within(rowFor('Терраса 7')).getByText(plain(fill(Q.question, { number: 7 }))),
    ).toBeInTheDocument();
  });

  it('marks an emptied Number or Seats invalid, which is the case that raises the message', async () => {
    const user = userEvent.setup();
    render(<TablesTable initial={tables} fetcher={vi.fn()} />);

    await user.click(within(rowFor('Терраса 7')).getByRole('button', { name: ACT.edit }));
    await user.clear(screen.getByLabelText(TB.number));
    await user.clear(screen.getByLabelText(TB.seats));
    await user.click(screen.getByRole('button', { name: ACT.save }));

    // `Number('')` is `0` - finite, an integer - so a check that only asks whether the text parses
    // marks the emptied field valid at the exact moment the save is refused for it.
    expect(screen.getByLabelText(TB.number)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(TB.seats)).toHaveAttribute('aria-invalid', 'true');
    // One convention across both admin screens: valid is the attribute being absent.
    expect(screen.getByLabelText(TB.label)).not.toHaveAttribute('aria-invalid');
  });

  it('names seats in the incomplete-save message, since seats can raise it', async () => {
    const user = userEvent.setup();
    render(<TablesTable initial={tables} fetcher={vi.fn()} />);

    await user.click(within(rowFor('Терраса 7')).getByRole('button', { name: ACT.edit }));
    await user.clear(screen.getByLabelText(TB.seats));
    await user.click(screen.getByRole('button', { name: ACT.save }));

    // The old sentence sent the operator to the number and the label, both of which are fine.
    expect(screen.getByRole('status')).toHaveTextContent(plain(TB.incomplete));
  });

  it('leaves focus on the toggle so a run of tables can be worked through', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ table: table(7, 'Терраса 7', false) });
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Терраса 7')).getByRole('button', { name: TB.deactivate }));

    // The same control under the hand that pressed it: a second press re-toggles the table
    // rather than opening the editor, which is what a keyboard hand would get if focus moved.
    const toggle = await within(rowFor('Терраса 7')).findByRole('button', { name: TB.activate });
    expect(toggle).toHaveFocus();
  });

  it('holds the row shut while a state change is still in flight', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Терраса 7')).getByRole('button', { name: TB.deactivate }));

    // Opening the row mid-flight would let the answer land on top of whatever had been typed.
    expect(within(rowFor('Терраса 7')).getByRole('button', { name: ACT.edit })).toBeDisabled();
  });

  it('gives the label a line only when it says something the number does not', () => {
    // The seed writes labels with an ordinary space; the dictionary binds «Стол 7» with U+00A0.
    // The row compares the two with their whitespace flattened, so a restaurant that never
    // renamed its tables does not read «Стол 4» twice per row over one invisible byte.
    render(
      <TablesTable
        initial={[table(4, plain(fill(TB.table, { number: 4 }))), table(5, 'Диван')]}
        fetcher={vi.fn()}
      />,
    );

    expect(screen.getAllByText(named(4))).toHaveLength(1);
    expect(screen.getByText('Диван')).toBeInTheDocument();
    expect(screen.getByText(named(5))).toBeInTheDocument();
  });

  it('says the room is empty rather than showing a table of nothing', () => {
    render(<TablesTable initial={[]} fetcher={vi.fn()} />);
    expect(screen.getByText(plain(TB.noTables))).toBeInTheDocument();
  });

  it('offers the printable sheet as a link the browser can download', () => {
    render(<TablesTable initial={tables} fetcher={vi.fn()} />);
    expect(screen.getByRole('link', { name: TB.printQr })).toHaveAttribute(
      'href',
      '/api/tables/qr.pdf',
    );
  });

  it('opens a new table at the next free number and posts it whole', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ table: table(8, 'Терраса 8') });
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(screen.getByRole('button', { name: TB.addTable }));
    expect(screen.getByLabelText(TB.number)).toHaveValue(8);
    await user.type(screen.getByLabelText(TB.label), 'Терраса 8');
    await user.click(screen.getByRole('button', { name: ACT.save }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/tables');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: {
        method: 'POST',
        body: JSON.stringify({ number: 8, label: 'Терраса 8', seats: 4, isActive: true }),
      },
    });
    expect(await screen.findByText('Терраса 8')).toBeInTheDocument();
  });

  it('opens its panel the way the menu row does, and the row keeps its height', async () => {
    const user = userEvent.setup();
    render(<TablesTable initial={tables} fetcher={vi.fn()} />);
    const heightOf = (row: Element) => row.className.match(/(?:^|\s)h-\d+(?:\s|$)/)?.[0];
    const height = heightOf(rowFor('Терраса 7'));
    expect(height).toBeDefined();

    await user.click(within(rowFor('Терраса 7')).getByRole('button', { name: ACT.edit }));

    // Every in-place editor in the admin opens the same way; one that appeared while its
    // neighbours faded read as unfinished. (class-level: jsdom does no layout.)
    const panel = screen.getByRole('button', { name: ACT.delete }).closest('[data-panel]');
    expect(panel?.className).toContain('starting:opacity-0');
    expect(panel?.className).toContain('transition-[opacity,translate]');
    expect(panel?.className).toContain('duration-[var(--motion-base)]');
    expect(panel?.className).not.toMatch(/\d+(?:ms|s)\b/);
    expect(heightOf(screen.getByLabelText(TB.label).closest('tr')!)).toBe(height);
  });

  it('sends only what an edit changed and closes the row on what came back', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ table: table(7, 'Терраса у окна') });
    render(<TablesTable initial={tables} fetcher={fetcher} />);

    await user.click(within(rowFor('Терраса 7')).getByRole('button', { name: ACT.edit }));
    await user.clear(screen.getByLabelText(TB.label));
    await user.type(screen.getByLabelText(TB.label), 'Терраса у окна');
    await user.click(screen.getByRole('button', { name: ACT.save }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: { method: 'PATCH', body: JSON.stringify({ label: 'Терраса у окна' }) },
    });
    expect(await screen.findByText('Терраса у окна')).toBeInTheDocument();
  });
});
