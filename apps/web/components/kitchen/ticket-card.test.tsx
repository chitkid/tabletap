import { render as rtlRender, screen, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrderDto } from '@tabletap/shared';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ru from '../../messages/ru.json';
import { TicketCard } from './ticket-card';

/**
 * Every word on a ticket comes from `messages/ru.json`, and the badge takes the glossary's
 * **kitchen** column — docs/design/02b-copy-ru.md — so `ready` here is «Готов» and not the
 * guest's «Готов — сейчас принесут». `useTranslations` resolves through `NextIntlClientProvider`
 * in every environment vitest runs in, so every render here goes through it.
 */
const withIntl = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: ReactElement, options?: RenderOptions) =>
  rtlRender(ui, { wrapper: withIntl, ...options });

/**
 * Accessible names are **composed from the dictionary, never typed**: `getByRole(…, { name })`
 * matches with an identity normaliser, so the U+00A0 inside «Стол 7» and after «№» has to be the
 * real byte. `toHaveTextContent` collapses it instead, which is why `plain` exists beside `fill`.
 */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string | number>) =>
  message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
const T = ru.kitchen.ticket;

const T0 = Date.parse('2026-09-03T10:00:00Z');
const order = (patch: Partial<OrderDto> = {}): OrderDto => ({
  id: 'o1',
  number: 42,
  status: 'paid',
  tableId: 't',
  tableNumber: 7,
  items: [
    {
      id: 'i1',
      menuItemId: 'm1',
      name: 'Margherita Flatbread',
      unitPriceCents: 1200,
      quantity: 2,
      lineTotalCents: 2400,
    },
  ],
  subtotalCents: 2400,
  totalCents: 2400,
  currency: 'USD',
  note: 'No basil',
  placedAt: '2026-09-03T10:00:00Z',
  paidAt: '2026-09-03T10:00:00Z',
  cookingAt: null,
  readyAt: null,
  servedAt: null,
  cancelledAt: null,
  createdAt: '2026-09-03T10:00:00Z',
  updatedAt: '2026-09-03T10:00:00Z',
  ...patch,
});

describe('TicketCard', () => {
  it('says table, number, lines, note and the next verb', () => {
    render(
      <TicketCard order={order()} now={T0 + 65_000} fresh onBump={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(
      screen.getByRole('heading', { name: fill(T.heading, { table: 7, number: 42 }) }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 × Margherita Flatbread')).toBeInTheDocument();
    expect(screen.getByText(plain(fill(T.note, { note: 'No basil' })))).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('1:05');
    expect(
      screen.getByRole('button', { name: fill(T.bump.paid, { number: 42 }) }),
    ).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('data-fresh', 'true');
  });
  it('badges a ticket with the board’s own word, not the guest’s', () => {
    render(
      <TicketCard order={order()} now={T0} fresh={false} onBump={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText(ru.status.kitchen.paid)).toBeInTheDocument();
    expect(screen.queryByText(ru.status.guest.paid)).toBeNull();
  });
  it('marks a late ticket in words, not only colour, and restarts the clock at cookingAt', () => {
    render(
      <TicketCard
        order={order({ status: 'cooking', cookingAt: '2026-09-03T10:04:00Z' })}
        now={T0 + 15 * 60_000}
        fresh={false}
        onBump={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('timer')).toHaveTextContent(`11:00 ${plain(ru.kitchen.timer.late)}`);
    expect(screen.getByRole('timer')).toHaveAttribute('data-threshold', 'late');
    expect(
      screen.getByRole('button', { name: fill(T.bump.cooking, { number: 42 }) }),
    ).toBeInTheDocument();
  });
  it('bumps to the next status and cancels behind a confirm', async () => {
    const user = userEvent.setup();
    const onBump = vi.fn();
    const onCancel = vi.fn();
    render(
      <TicketCard order={order()} now={T0} fresh={false} onBump={onBump} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole('button', { name: fill(T.bump.paid, { number: 42 }) }));
    expect(onBump).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), 'cooking');
    await user.click(screen.getByRole('button', { name: fill(T.cancel, { number: 42 }) }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(
      screen.getByRole('group', { name: fill(T.confirm, { number: 42 }) }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: T.confirmYes }));
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }));
  });
  it('keeps the ticket when the confirm is declined', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <TicketCard order={order()} now={T0} fresh={false} onBump={vi.fn()} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole('button', { name: fill(T.cancel, { number: 42 }) }));
    await user.click(screen.getByRole('button', { name: T.confirmKeep }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: fill(T.cancel, { number: 42 }) }),
    ).toBeInTheDocument();
  });
  it('disables the bump while a move is pending and offers no cancel past New', () => {
    render(
      <TicketCard
        order={order({ status: 'ready', readyAt: '2026-09-03T10:09:00Z' })}
        now={T0}
        fresh={false}
        pending
        onBump={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: fill(T.bump.ready, { number: 42 }) })).toBeDisabled();
    expect(screen.queryByRole('button', { name: fill(T.cancel, { number: 42 }) })).toBeNull();
  });
  it('fades a ticket that arrives on a board already on screen into place, over a token duration (class-level: jsdom does no layout, so this proves the classes are there, not that anything moved)', () => {
    render(
      <TicketCard order={order()} now={T0} fresh arriving onBump={vi.fn()} onCancel={vi.fn()} />,
    );
    const { className } = screen.getByRole('article');
    expect(className).toContain('starting:opacity-0');
    expect(className).toContain('starting:translate-y-2');
    expect(className).toContain('duration-[var(--motion-base)]');
    expect(className).toContain('ease-[var(--motion-ease)]');
    // Only opacity and transform: anything else would move the board's layout-shift number.
    expect(className).toContain('transition-[opacity,translate]');
    expect(className).not.toMatch(/\d+(?:ms|s)\b/);
  });
  it('leaves a ticket that was already on the board when the screen came up alone', () => {
    render(
      <TicketCard order={order()} now={T0} fresh={false} onBump={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('article').className).not.toContain('starting:');
  });
});
