import type { MenuItemDto } from '@tabletap/shared';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { useState, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import ru from '../../messages/ru.json';
import { MenuRow } from './menu-row';

const CATEGORY_ID = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f02';
const ITEM_ID = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f03';
const dish: MenuItemDto = {
  id: ITEM_ID,
  categoryId: CATEGORY_ID,
  name: 'Пицца «Маргарита»',
  description: 'Томаты, моцарелла, базилик',
  priceCents: 1200,
  allergens: ['gluten'],
  isAvailable: true,
  imageUrl: null,
  sortOrder: 0,
};

/**
 * Every word this row draws comes from `messages/ru.json`. The allergen names come from the
 * shared `allergens` namespace, which the guest's dish card reads too — the enum itself is nine
 * English identifiers and is never what an operator sees.
 */
const withIntl = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    <table>
      <tbody>{children}</tbody>
    </table>
  </NextIntlClientProvider>
);
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: withIntl });

const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string | number>) =>
  message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
const M = ru.admin.menu;
const ACT = ru.admin.actions;
const R = ru.admin.refusal;
const E = ru.errors;

/**
 * The word the availability switch is showing. Both words live in the control at all times so it
 * is always as wide as the wider of them; the spare one carries `invisible`, which reserves its
 * box and draws nothing. jsdom computes no Tailwind, so the class is what says which is which —
 * and reading the shown word through it is the only way this file can tell the two states apart,
 * because `textContent` now holds both.
 */
const shownWord = (toggle: HTMLElement) =>
  [...toggle.querySelectorAll('span')]
    .filter((span) => !span.className.split(/\s+/).includes('invisible'))
    .map((span) => span.textContent)
    .join('');

/** What `MenuTable` does for a row: it owns the dish, and it owns which row is open. */
function Harness({
  initial = dish,
  isNew = false,
  fetcher,
  onDeleted = vi.fn(),
  onSaved = vi.fn(),
}: {
  initial?: MenuItemDto;
  isNew?: boolean;
  fetcher: Parameters<typeof MenuRow>[0]['fetcher'];
  onDeleted?: (id: string) => void;
  onSaved?: (item: MenuItemDto) => void;
}) {
  const [item, setItem] = useState(initial);
  const [editing, setEditing] = useState(isNew);
  const [removed, setRemoved] = useState(false);
  if (removed) return null;
  return (
    <MenuRow
      item={item}
      currency="RUB"
      editing={editing}
      isNew={isNew}
      fetcher={fetcher}
      onEdit={() => setEditing(true)}
      onCancel={() => setEditing(false)}
      onSaved={(saved) => {
        setItem(saved);
        setEditing(false);
        onSaved(saved);
      }}
      onDeleted={(id) => {
        setRemoved(true);
        onDeleted(id);
      }}
    />
  );
}

const lineOf = () => screen.getAllByRole('row')[0] as HTMLElement;
/**
 * The row's own notice, which opens the expanded panel; the photo field keeps a second one for
 * its own failures further down, next to the control each of them is about.
 */
const noticeOf = () => screen.getAllByRole('status')[0] as HTMLElement;

describe('MenuRow', () => {
  it('turns the row into inputs without changing the height of the row', async () => {
    const user = userEvent.setup();
    render(<Harness fetcher={vi.fn()} />);
    const height = lineOf().className.match(/(?:^|\s)h-\d+(?:\s|$)/)?.[0];
    expect(height).toBeDefined();
    expect(screen.queryByLabelText(M.name)).toBeNull();

    await user.click(screen.getByRole('button', { name: ACT.edit }));

    expect(screen.getByLabelText(M.name)).toHaveValue(dish.name);
    expect(screen.getByLabelText(M.price)).toHaveValue(12);
    expect(lineOf().className.match(/(?:^|\s)h-\d+(?:\s|$)/)?.[0]).toBe(height);
  });

  it('names a dish by its allergens in Russian, never by the enum the API carries', () => {
    render(<Harness fetcher={vi.fn()} />);
    // The read row's second line is the description and the allergens, and the words for the
    // allergens are the shared ones the guest's dish card reads.
    expect(screen.getByText(`${dish.description} · ${ru.allergens.gluten}`)).toBeInTheDocument();
    expect(screen.queryByText(/gluten/)).toBeNull();
  });

  it('opens the panel with token-based motion while the row it hangs from stays still (class-level: jsdom does no layout, so this proves the classes are there, not that anything moved)', async () => {
    const user = userEvent.setup();
    render(<Harness fetcher={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: ACT.edit }));

    const panel = screen.getByLabelText(M.description).closest('[data-panel]');
    expect(panel?.className).toContain('starting:opacity-0');
    expect(panel?.className).toContain('transition-[opacity,translate]');
    expect(panel?.className).toContain('duration-[var(--motion-base)]');
    expect(panel?.className).toContain('ease-[var(--motion-ease)]');
    expect(panel?.className).not.toMatch(/\d+(?:ms|s)\b/);
    // The row itself is M5's fixed line and carries none of it.
    expect(lineOf().className).not.toContain('starting:');
  });

  it('saves only the fields that changed and shows what the server answered', async () => {
    const user = userEvent.setup();
    const saved: MenuItemDto = { ...dish, name: 'Маргарита', priceCents: 1350 };
    const fetcher = vi.fn().mockResolvedValue({ item: saved });
    render(<Harness fetcher={fetcher} />);

    await user.click(screen.getByRole('button', { name: ACT.edit }));
    await user.clear(screen.getByLabelText(M.name));
    await user.type(screen.getByLabelText(M.name), 'Маргарита');
    await user.clear(screen.getByLabelText(M.price));
    await user.type(screen.getByLabelText(M.price), '13.50');
    await user.click(screen.getByRole('button', { name: ACT.save }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/menu/items/${ITEM_ID}`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: { method: 'PATCH', body: JSON.stringify({ name: 'Маргарита', priceCents: 1350 }) },
    });
    expect(await screen.findByText('Маргарита')).toBeInTheDocument();
    expect(screen.getByText('14 ₽')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ACT.edit })).toBeInTheDocument();
  });

  it('posts a new dish whole', async () => {
    const user = userEvent.setup();
    const draft: MenuItemDto = {
      ...dish,
      id: 'draft-1',
      name: '',
      description: '',
      priceCents: 0,
      allergens: [],
      sortOrder: 3,
    };
    const created: MenuItemDto = { ...draft, id: ITEM_ID, name: 'Фокачча', priceCents: 600 };
    const fetcher = vi.fn().mockResolvedValue({ item: created });
    render(<Harness initial={draft} isNew fetcher={fetcher} />);

    await user.type(screen.getByLabelText(M.name), 'Фокачча');
    await user.clear(screen.getByLabelText(M.price));
    await user.type(screen.getByLabelText(M.price), '6.00');
    await user.click(screen.getByRole('button', { name: ACT.save }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/menu/items');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: {
        method: 'POST',
        body: JSON.stringify({
          categoryId: CATEGORY_ID,
          name: 'Фокачча',
          description: '',
          priceCents: 600,
          allergens: [],
          isAvailable: true,
          sortOrder: 3,
        }),
      },
    });
  });

  it('restores every previous value and names what the server refused', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const fetcher = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          409,
          'CONFLICT',
          'itemChanged',
          'This item changed while you were editing it. Reload and try again.',
        ),
      );
    render(<Harness fetcher={fetcher} onSaved={onSaved} />);

    await user.click(screen.getByRole('button', { name: ACT.edit }));
    await user.clear(screen.getByLabelText(M.name));
    await user.type(screen.getByLabelText(M.name), 'Маринара');
    await user.click(screen.getByRole('switch', { name: M.available }));
    await user.click(screen.getByRole('button', { name: ACT.save }));

    // Both halves are Russian now. The frame «Не удалось {verb}. {message}» and the verb come from
    // `admin.refusal`; the second half is resolved from the refusal's key through `errors.*`. The
    // API's own English sentence arrived on the same error and is not on screen - the assertion
    // below is what says so, and it is the only thing that can, because that sentence is composed
    // in another process and no source scan in this repository can reach it.
    // Whole-string, and raw on both sides: `textContent` carries the dictionary's U+00A0 and so
    // does `fill`, so nothing is normalised away and nothing is a substring match. That matters
    // here because the sentence this frame wraps is byte-identical to one the operator's own
    // surface can produce - see the IN_USE case below - and `toHaveTextContent` could not tell
    // the two apart. It also subsumes the `not.toContain('Reload and try again')` that used to
    // follow: an equality leaves no room for the English to be anywhere in the line.
    await waitFor(() =>
      expect(noticeOf().textContent).toBe(
        fill(R.withReason, { verb: R.verb.save, message: E.itemChanged }),
      ),
    );
    expect(screen.getByLabelText(M.name)).toHaveValue(dish.name);
    expect(screen.getByLabelText(M.price)).toHaveValue(12);
    expect(screen.getByRole('switch', { name: M.available })).toBeChecked();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('falls back to a whole Russian sentence when the failure carries no server message', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    render(<Harness fetcher={fetcher} />);

    await user.click(screen.getByRole('button', { name: ACT.edit }));
    await user.clear(screen.getByLabelText(M.name));
    await user.type(screen.getByLabelText(M.name), 'Маринара');
    await user.click(screen.getByRole('button', { name: ACT.save }));

    // Nothing of the thrown error reaches the screen: a `TypeError` is not an `ApiError`, so there
    // is no sentence to pass on and the whole line is the dictionary's.
    await waitFor(() =>
      expect(noticeOf()).toHaveTextContent(plain(fill(R.tryAgain, { verb: R.verb.save }))),
    );
    expect(noticeOf().textContent).not.toContain('Failed to fetch');
  });

  it('marks an emptied price invalid, which is the case that raises the message', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    render(<Harness fetcher={fetcher} />);

    await user.click(screen.getByRole('button', { name: ACT.edit }));
    await user.clear(screen.getByLabelText(M.price));
    await user.click(screen.getByRole('button', { name: ACT.save }));

    // `Number('')` is `0` - finite - so a check that only asks whether the text parses marks the
    // emptied field valid at the exact moment the save is refused for it.
    expect(fetcher).not.toHaveBeenCalled();
    expect(noticeOf()).toHaveTextContent(plain(M.dishIncomplete));
    expect(screen.getByLabelText(M.price)).toHaveAttribute('aria-invalid', 'true');
    // One convention across both admin screens: valid is the attribute being absent, not
    // `aria-invalid="false"`.
    expect(screen.getByLabelText(M.name)).not.toHaveAttribute('aria-invalid');
  });

  it('names the availability switch for what it switches, not for the state it is in', async () => {
    const user = userEvent.setup();
    render(<Harness fetcher={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: ACT.edit }));

    const toggle = screen.getByRole('switch', { name: M.available });
    expect(toggle).toBeChecked();
    // The dictionary's own bytes, not `plain()`: this reads `textContent` rather than going
    // through a query, and nothing normalises the U+00A0 inside «В наличии» on the way.
    expect(shownWord(toggle)).toBe(M.available);

    await user.click(toggle);

    // The same control under the same name: only the state and the word inside it moved. A name
    // that flipped to «Закончилось» would announce an unavailable dish as "Закончилось,
    // переключатель, выключен" - a double negative, to the operators least able to afford one.
    expect(screen.getByRole('switch', { name: M.available })).toBe(toggle);
    expect(toggle).not.toBeChecked();
    expect(shownWord(toggle)).toBe(M.soldOut);
  });

  it('keeps both words inside the switch, so pressing it changes no width', async () => {
    const user = userEvent.setup();
    render(<Harness fetcher={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: ACT.edit }));
    const toggle = screen.getByRole('switch', { name: M.available });

    // The reservation itself, not the class that implements it: «Закончилось» is 15.43 px wider
    // than «В наличии», and a control that renders only the word it is currently showing is that
    // much narrower in one state than the other — which moves its column under the operator's
    // hand. Both words are always in the control; one of them is only hidden.
    //
    // A whole-value comparison rather than a pair of "contains" assertions: the old test asked
    // `toHaveTextContent`, which is a substring match, so once both words were in the element it
    // passed in both states and had stopped asserting anything. `e2e/layout-ru.spec.ts` measures
    // the width this reserves; this is the part jsdom can see.
    const words = () => [...toggle.querySelectorAll('span')].map((span) => span.textContent);
    // Code points before the value comparison, the way `tables-table.test.tsx` orders its own
    // NBSP guard: «В наличии» binds its two words with U+00A0, and a `toEqual` whose only
    // difference is that byte prints «В наличии» against «В наличии» and cannot be read.
    expect(words().map((word) => [...(word ?? '')].some((c) => c === NBSP))).toEqual([true, false]);
    expect(words()).toEqual([M.available, M.soldOut]);
    await user.click(toggle);
    expect(words()).toEqual([M.available, M.soldOut]);
  });

  it('restores on cancel without asking the server anything', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    render(<Harness fetcher={fetcher} />);

    await user.click(screen.getByRole('button', { name: ACT.edit }));
    await user.clear(screen.getByLabelText(M.name));
    await user.type(screen.getByLabelText(M.name), 'Маринара');
    await user.click(screen.getByRole('button', { name: ACT.cancel }));

    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByText(dish.name)).toBeInTheDocument();
    expect(screen.queryByText('Маринара')).toBeNull();
  });

  it('keeps a dish that is on an order and says to mark it sold out instead', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const fetcher = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          409,
          'IN_USE',
          'itemInUse',
          'This item appears on an order. Mark it sold out instead.',
        ),
      );
    render(<Harness fetcher={fetcher} onDeleted={onDeleted} />);

    await user.click(screen.getByRole('button', { name: ACT.edit }));
    await user.click(screen.getByRole('button', { name: ACT.delete }));

    // `IN_USE` is the one refusal with a way out, and the way out is the operator's own sentence
    // rather than the server's.
    //
    // **Whole-string, because a substring match cannot tell those two apart any more.**
    // `errors.itemInUse` is byte-identical to `admin.menu.dishInUse` - the same situation said
    // the same way from either side - so `toHaveTextContent(plain(M.dishInUse))` stayed green with
    // `refuseDelete`'s special case removed, the exact edit this test exists to forbid: the
    // fallback «Не удалось удалить. <the same sentence>» still *contains* the needle. An equality
    // fails on the frame, which is the only thing that differs.
    await waitFor(() => expect(noticeOf().textContent).toBe(M.dishInUse));
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByLabelText(M.name)).toHaveValue(dish.name);
  });

  it('removes a dish nothing depends on', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    render(<Harness fetcher={fetcher} onDeleted={onDeleted} />);

    await user.click(screen.getByRole('button', { name: ACT.edit }));
    await user.click(screen.getByRole('button', { name: ACT.delete }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(ITEM_ID));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/menu/items/${ITEM_ID}`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ init: { method: 'DELETE' } });
  });
});
