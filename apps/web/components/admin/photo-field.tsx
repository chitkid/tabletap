'use client';
import { MenuItemDtoSchema, PhotoUploadResponseSchema, type MenuItemDto } from '@tabletap/shared';
import { Button, Input, Label } from '@tabletap/ui';
import { useId, useRef, useState } from 'react';
import { z } from 'zod';
import { clientFetch } from '../../lib/api';
import { asJson } from './row-editor';

const ItemResponseSchema = z.object({ item: MenuItemDtoSchema });

/**
 * The browser's own check, and only that. The server signs the key, the content type and the
 * ceiling, and refuses anything else at the confirmation step — this exists to save an operator a
 * round trip and a wait, not to be the enforcement.
 */
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type PhotoType = (typeof PHOTO_TYPES)[number];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const isPhotoType = (type: string): type is PhotoType =>
  (PHOTO_TYPES as readonly string[]).includes(type);

const HINT = 'JPEG, PNG or WebP, up to 5 MB.';
const BUSY = 'Uploading…';
const FAILED = "Couldn't upload that. Try again.";

/** The raw PUT to storage. No cookie, no envelope: it is not this API, it is the bucket. */
async function putToStorage(url: string, file: File): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    body: file,
    headers: { 'content-type': file.type },
  });
  if (!res.ok) throw new Error(`Storage refused the upload with status ${res.status}`);
}

/**
 * Three steps, in this order: ask the API for a signed URL, PUT the bytes straight to storage,
 * then confirm with the key so the API writes `image_url`. Until that last call lands the dish
 * keeps whatever picture it had, which is what makes a failed PUT harmless.
 */
export function PhotoField({
  itemId,
  itemName,
  imageUrl,
  fetcher = clientFetch,
  upload = putToStorage,
  onUploaded,
}: {
  itemId: string;
  itemName: string;
  /** What the dish has now. Replaced on screen only once the confirmation has answered. */
  imageUrl: string | null;
  fetcher?: typeof clientFetch;
  upload?: (url: string, file: File) => Promise<void>;
  onUploaded?: (item: MenuItemDto) => void;
}) {
  const fieldId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const shown = uploaded ?? imageUrl;

  const send = async () => {
    if (chosen === null) return;
    if (!isPhotoType(chosen.type) || chosen.size > MAX_PHOTO_BYTES) {
      setNotice(FAILED);
      return;
    }
    const contentType = chosen.type;
    setBusy(true);
    setNotice('');
    try {
      const presigned = await fetcher(`/api/menu/items/${itemId}/photo-url`, {
        schema: PhotoUploadResponseSchema,
        init: asJson('POST', { contentType }),
      });
      await upload(presigned.url, chosen);
      const { item } = await fetcher(`/api/menu/items/${itemId}/photo`, {
        schema: ItemResponseSchema,
        init: asJson('POST', { key: presigned.key }),
      });
      setUploaded(item.imageUrl);
      setChosen(null);
      if (inputRef.current !== null) inputRef.current.value = '';
      setNotice('');
      onUploaded?.(item);
    } catch {
      // Every failure reads the same because every fix is the same: choose the file again. The
      // hint above the control says what will be taken, so the line does not have to repeat it.
      setNotice(FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3">
      {shown === null ? (
        <div
          aria-hidden="true"
          className="size-16 shrink-0 rounded-md border border-dashed border-border/60 bg-secondary"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- an arbitrary storage host, at a size the panel fixes
        <img
          src={shown}
          alt={itemName}
          className="size-16 shrink-0 rounded-md border border-border/60 object-cover"
        />
      )}
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={fieldId}>Photo file</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={fieldId}
            ref={inputRef}
            type="file"
            accept={PHOTO_TYPES.join(',')}
            aria-describedby={hintId}
            className="max-w-xs"
            onChange={(event) => {
              setChosen(event.target.files?.[0] ?? null);
              setNotice('');
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={chosen === null || busy}
            aria-busy={busy || undefined}
            onClick={() => void send()}
          >
            {busy ? BUSY : shown === null ? 'Add a photo' : 'Replace the photo'}
          </Button>
        </div>
        <p id={hintId} className="text-sm text-muted-foreground">
          {HINT}
        </p>
        {/* Always in the layout, empty when there is nothing to say, so the panel never jumps.
            The busy state lives on the button itself, where the press was. */}
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-destructive">
          {notice}
        </p>
      </div>
    </div>
  );
}
