import type { TableDto } from '@tabletap/shared';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import ru from '../../messages/ru.json';
import { QrActions } from './qr-actions';

const TABLE_ID = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f07';
const table: TableDto = {
  id: TABLE_ID,
  number: 7,
  label: 'Терраса 7',
  seats: 4,
  isActive: true,
};

const withIntl = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: withIntl });

/**
 * Fixtures are composed from `messages/ru.json`, never typed: `getByRole(…, { name })` matches the
 * accessible name with an identity normaliser, so «стола 7»'s U+00A0 has to be the real byte,
 * while `getByText` and `toHaveTextContent` collapse it and need `plain`.
 */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string | number>) =>
  message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
const Q = ru.admin.qr;
const R = ru.admin.refusal;
const E = ru.errors;

const QUESTION = plain(fill(Q.question, { number: 7 }));
const REISSUED = plain(fill(Q.reissued, { number: 7 }));

/** The row's other controls, which the question takes away with it while it stands. */
const sibling = <button type="button">{ru.admin.actions.edit}</button>;

describe('QrActions', () => {
  it('asks in place rather than in a dialog, and names the table and the consequence', async () => {
    const user = userEvent.setup();
    render(
      <QrActions table={table} fetcher={vi.fn()}>
        {sibling}
      </QrActions>,
    );

    await user.click(screen.getByRole('button', { name: Q.reissue }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(QUESTION)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: Q.reissue })).toBeNull();
    // Nothing else on the row can be pressed while the question stands.
    expect(screen.queryByRole('button', { name: ru.admin.actions.edit })).toBeNull();
    // Whichever of the two the operator reaches first, the consequence is read out with it. The
    // accessible description is not collapsed, so this one keeps the dictionary's own bytes.
    const described = fill(Q.question, { number: 7 });
    const keep = screen.getByRole('button', { name: Q.keep });
    expect(keep).toHaveAccessibleDescription(described);
    expect(screen.getByRole('button', { name: Q.confirm })).toHaveAccessibleDescription(described);
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

    await user.click(screen.getByRole('button', { name: Q.reissue }));
    await user.click(screen.getByRole('button', { name: Q.keep }));

    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(screen.getByRole('button', { name: ru.admin.actions.edit })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: Q.reissue })).toHaveFocus();
  });

  it('lets Escape out of the question the way it lets a hand out', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    render(
      <QrActions table={table} fetcher={fetcher}>
        {sibling}
      </QrActions>,
    );

    await user.click(screen.getByRole('button', { name: Q.reissue }));
    await user.keyboard('{Escape}');

    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(screen.getByRole('button', { name: Q.reissue })).toHaveFocus();
  });

  it('posts once on Yes, reissue and then says to print the sheet again', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ table });
    render(
      <QrActions table={table} fetcher={fetcher}>
        {sibling}
      </QrActions>,
    );

    await user.click(screen.getByRole('button', { name: Q.reissue }));
    await user.click(screen.getByRole('button', { name: Q.confirm }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(REISSUED));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/tables/${TABLE_ID}/qr`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ init: { method: 'POST' } });
    expect(screen.getByRole('button', { name: Q.reissue })).toBeInTheDocument();
  });

  it('leaves the code alone and says so when the server refuses', async () => {
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
    render(
      <QrActions table={table} fetcher={fetcher}>
        {sibling}
      </QrActions>,
    );

    await user.click(screen.getByRole('button', { name: Q.reissue }));
    await user.click(screen.getByRole('button', { name: Q.confirm }));

    // The frame, the verb and the server's own half are all the dictionary's: the second half is
    // resolved from the refusal's key, and the English sentence that arrived with it stays in the
    // log. The refusal is named for the act, not for a save.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        plain(fill(R.withReason, { verb: R.verb.reissueCode, message: E.tableChanged })),
      ),
    );
    expect(screen.getByRole('status').textContent).not.toContain('Reload and try again');
    expect(screen.queryByText(REISSUED)).toBeNull();
    expect(screen.getByRole('button', { name: Q.reissue })).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: Q.reissue }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
