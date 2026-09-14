import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { StrictMode, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
import ru from '../messages/ru.json';
import { ClaimTable } from './claim-table';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('ClaimTable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    replace.mockClear();
  });
  it('claims the table and goes to the menu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(200, {
          table: { id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f01', number: 7, label: 'Стол 7' },
          expiresAt: '2026-09-03T14:00:00.000Z',
        }),
      ),
    );
    render(withProvider(<ClaimTable token="abc" />));
    expect(screen.getByRole('status')).toHaveTextContent('Ищем ваш стол…');
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/menu'));
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/guest/claim');
  });
  it('claims the table once under StrictMode', async () => {
    const f = vi.fn(async () =>
      json(200, {
        table: { id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f01', number: 7, label: 'Стол 7' },
        expiresAt: '2026-09-03T14:00:00.000Z',
      }),
    );
    vi.stubGlobal('fetch', f);
    render(
      withProvider(
        <StrictMode>
          <ClaimTable token="abc" />
        </StrictMode>,
      ),
    );
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/menu'));
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('explains an expired code and can retry', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'TOKEN_EXPIRED', message: 'x' } }))
      .mockResolvedValueOnce(
        json(200, {
          table: { id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f01', number: 7, label: 'Стол 7' },
          expiresAt: '2026-09-03T14:00:00.000Z',
        }),
      );
    vi.stubGlobal('fetch', f);
    render(withProvider(<ClaimTable token="abc" />));
    // `getByText` collapses the U+00A0 binding «у» to its noun, so this fixture is a plain space.
    expect(
      await screen.findByText('Срок действия QR-кода истёк. Попросите у сотрудников новый.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/menu'));
  });
  it('maps the other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(404, { error: { code: 'NOT_FOUND', message: 'x' } })),
    );
    render(withProvider(<ClaimTable token="abc" />));
    expect(await screen.findByText('Этот стол сейчас недоступен.')).toBeInTheDocument();
    // Try again cannot help a table that is gone: there has to be a way off this screen. The name
    // is read from the dictionary because `getByRole` does not collapse its U+00A0.
    expect(screen.getByRole('link', { name: ru.guest.claim.home })).toHaveAttribute('href', '/');
  });
});
