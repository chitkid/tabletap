import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
import { ClaimTable } from './claim-table';

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
          table: { id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f01', number: 7, label: 'Table 7' },
          expiresAt: '2026-09-03T14:00:00.000Z',
        }),
      ),
    );
    render(<ClaimTable token="abc" />);
    expect(screen.getByRole('status')).toHaveTextContent('Finding your table…');
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/menu'));
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/guest/claim');
  });
  it('claims the table once under StrictMode', async () => {
    const f = vi.fn(async () =>
      json(200, {
        table: { id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f01', number: 7, label: 'Table 7' },
        expiresAt: '2026-09-03T14:00:00.000Z',
      }),
    );
    vi.stubGlobal('fetch', f);
    render(
      <StrictMode>
        <ClaimTable token="abc" />
      </StrictMode>,
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
          table: { id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f01', number: 7, label: 'Table 7' },
          expiresAt: '2026-09-03T14:00:00.000Z',
        }),
      );
    vi.stubGlobal('fetch', f);
    render(<ClaimTable token="abc" />);
    expect(
      await screen.findByText('This QR code has expired. Ask staff for a new one.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/menu'));
  });
  it('maps the other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(404, { error: { code: 'NOT_FOUND', message: 'x' } })),
    );
    render(<ClaimTable token="abc" />);
    expect(await screen.findByText('This table is not available right now.')).toBeInTheDocument();
    // Try again cannot help a table that is gone: there has to be a way off this screen.
    expect(screen.getByRole('link', { name: 'Back to the start' })).toHaveAttribute('href', '/');
  });
});
