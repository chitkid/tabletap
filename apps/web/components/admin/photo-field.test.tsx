import type { MenuItemDto } from '@tabletap/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PhotoField } from './photo-field';

const ITEM_ID = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f03';
const item: MenuItemDto = {
  id: ITEM_ID,
  categoryId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f02',
  name: 'Margherita Flatbread',
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

function renderField(
  props: Partial<Parameters<typeof PhotoField>[0]> & {
    fetcher: Parameters<typeof PhotoField>[0]['fetcher'];
    upload: Parameters<typeof PhotoField>[0]['upload'];
  },
) {
  render(
    <PhotoField itemId={ITEM_ID} itemName="Margherita Flatbread" imageUrl={null} {...props} />,
  );
  return screen.getByLabelText('Photo file') as HTMLInputElement;
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
    await user.click(screen.getByRole('button', { name: 'Add a photo' }));

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
    const photo = await screen.findByRole('img', { name: 'Margherita Flatbread' });
    expect(photo).toHaveAttribute('src', 'https://cdn.example/menu/new.jpg');
    expect(onUploaded).toHaveBeenCalledWith(item);
  });

  it('keeps the old photo and says the upload failed when the put is refused', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue(PRESIGNED);
    const upload = vi.fn().mockRejectedValue(new Error('403'));
    const input = renderField({ fetcher, upload, imageUrl: 'https://cdn.example/menu/old.jpg' });

    await user.upload(input, file('plate.jpg', 'image/jpeg', 2048));
    await user.click(screen.getByRole('button', { name: 'Replace the photo' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent("Couldn't upload that. Try again."),
    );
    // The confirmation never ran, so the dish keeps whatever picture it had.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: 'Margherita Flatbread' })).toHaveAttribute(
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
    await user.click(screen.getByRole('button', { name: 'Add a photo' }));

    expect(screen.getByRole('status')).toHaveTextContent("Couldn't upload that. Try again.");
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
    await user.click(screen.getByRole('button', { name: 'Add a photo' }));

    expect(screen.getByRole('status')).toHaveTextContent("Couldn't upload that. Try again.");
    expect(fetcher).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('states what the field will take', () => {
    renderField({ fetcher: vi.fn(), upload: vi.fn() });
    expect(screen.getByText('JPEG, PNG or WebP, up to 5 MB.')).toBeInTheDocument();
  });
});
