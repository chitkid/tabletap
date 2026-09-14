import type { MenuItemDto } from '@tabletap/shared';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ru from '../../messages/ru.json';
import { PhotoField } from './photo-field';

const ITEM_ID = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f03';
const item: MenuItemDto = {
  id: ITEM_ID,
  categoryId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f02',
  name: 'Фокачча с розмарином',
  description: '',
  priceCents: 1200,
  allergens: [],
  isAvailable: true,
  imageUrl: 'https://cdn.example/menu/new.jpg',
  sortOrder: 0,
};
const PRESIGNED = {
  url: 'https://storage.example/menu/new.jpg?signature=abc',
  key: 'menu/018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f03/new.jpg',
  expiresInSeconds: 60,
};
const file = (name: string, type: string, bytes: number) =>
  new File([new Uint8Array(bytes)], name, { type });

const withIntl = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: withIntl });

const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const P = ru.admin.photo;

function renderField(
  props: Partial<Parameters<typeof PhotoField>[0]> & {
    fetcher: Parameters<typeof PhotoField>[0]['fetcher'];
    upload: Parameters<typeof PhotoField>[0]['upload'];
  },
) {
  render(<PhotoField itemId={ITEM_ID} itemName={item.name} imageUrl={null} {...props} />);
  return screen.getByLabelText(P.field) as HTMLInputElement;
}

describe('PhotoField', () => {
  it('asks for a signed url, puts the file on it, confirms with the key and shows the photo', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValueOnce(PRESIGNED).mockResolvedValueOnce({ item });
    const upload = vi.fn().mockResolvedValue(undefined);
    const onUploaded = vi.fn();
    const chosen = file('plate.jpg', 'image/jpeg', 2048);
    const input = renderField({ fetcher, upload, onUploaded });

    await user.upload(input, chosen);
    await user.click(screen.getByRole('button', { name: P.add }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/menu/items/${ITEM_ID}/photo-url`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: { method: 'POST', body: JSON.stringify({ contentType: 'image/jpeg' }) },
    });
    expect(upload).toHaveBeenCalledWith(PRESIGNED.url, chosen);
    expect(fetcher.mock.calls[1]?.[0]).toBe(`/api/menu/items/${ITEM_ID}/photo`);
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      init: { method: 'POST', body: JSON.stringify({ key: PRESIGNED.key }) },
    });
    const photo = await screen.findByRole('img', { name: item.name });
    expect(photo).toHaveAttribute('src', 'https://cdn.example/menu/new.jpg');
    expect(onUploaded).toHaveBeenCalledWith(item);
  });

  it('keeps the old photo and says the upload failed when the put is refused', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue(PRESIGNED);
    const upload = vi.fn().mockRejectedValue(new Error('403'));
    const input = renderField({ fetcher, upload, imageUrl: 'https://cdn.example/menu/old.jpg' });

    await user.upload(input, file('plate.jpg', 'image/jpeg', 2048));
    await user.click(screen.getByRole('button', { name: P.replace }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(plain(P.failed)));
    // The confirmation never ran, so the dish keeps whatever picture it had.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: item.name })).toHaveAttribute(
      'src',
      'https://cdn.example/menu/old.jpg',
    );
  });

  it('refuses a file over 5 MB in the browser, before any request', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    const upload = vi.fn();
    const input = renderField({ fetcher, upload });

    await user.upload(input, file('huge.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1));
    await user.click(screen.getByRole('button', { name: P.add }));

    expect(screen.getByRole('status')).toHaveTextContent(plain(P.failed));
    expect(fetcher).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a photograph, before any request', async () => {
    // `accept` only filters the picker; a real operator can still choose "All files", so the
    // guard has to hold for a file the attribute would have hidden.
    const user = userEvent.setup({ applyAccept: false });
    const fetcher = vi.fn();
    const upload = vi.fn();
    const input = renderField({ fetcher, upload });

    await user.upload(input, file('notes.txt', 'text/plain', 12));
    await user.click(screen.getByRole('button', { name: P.add }));

    expect(screen.getByRole('status')).toHaveTextContent(plain(P.failed));
    expect(fetcher).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('states what the field will take, under a label that is visible rather than a placeholder', () => {
    const input = renderField({ fetcher: vi.fn(), upload: vi.fn() });
    expect(screen.getByText(plain(P.hint))).toBeInTheDocument();
    // The standing rule of this surface: the name of a field is on screen, not inside it. The
    // element that names this input carries no `sr-only`, and the input carries no placeholder.
    const label = screen.getByText(P.field);
    expect(label.tagName).toBe('LABEL');
    expect(label.className.split(/\s+/)).not.toContain('sr-only');
    expect(input.getAttribute('placeholder')).toBeNull();
  });

  it('disables the control and explains why when uploads are off, reaching neither input nor route', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    const upload = vi.fn();
    const input = renderField({ fetcher, upload, uploadsEnabled: false });

    expect(input).toBeDisabled();
    const button = screen.getByRole('button', { name: P.add });
    expect(button).toBeDisabled();
    const explanation = screen.getByText(plain(P.off));
    expect(explanation).toBeInTheDocument();
    // The reason has to be part of the disabled control's own description, not loose text on the
    // page, or a screen reader announces "disabled" with no explanation of why.
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(explanation.id);

    // A disabled control cannot be reached: choosing a file and pressing the button does nothing.
    await user.upload(input, file('plate.jpg', 'image/jpeg', 2048));
    await user.click(button);

    expect(fetcher).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});
