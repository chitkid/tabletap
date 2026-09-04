'use client';
import { Button } from '@tabletap/ui';
import { z } from 'zod';
import { ApiError } from '../../lib/api';

/**
 * What a category row and a dish row share. Both are the same thing wearing different fields — an
 * in-place editor with a Save, a Cancel and one line to say what went wrong — so the wording, the
 * request shapes and the two fragments an operator actually reads live here rather than in two
 * copies that the next copy change would have to find both of.
 */

/** Every admin delete answers the same body. */
export const OkResponseSchema = z.object({ ok: z.literal(true) });

/** `Couldn't save.` and then whatever the server said, because the server said it best. */
export const refusal = (error: unknown) =>
  error instanceof ApiError ? `Couldn't save. ${error.message}` : "Couldn't save. Try again.";

/**
 * A refused delete. `IN_USE` is the one failure with a way out, and the way out differs by row —
 * empty the category, or mark the dish sold out — so the caller supplies that sentence in the
 * operator's words rather than passing the server's own along.
 */
export const deleteRefusal = (error: unknown, inUse: string) =>
  error instanceof ApiError && error.code === 'IN_USE' ? inUse : refusal(error);

export const asJson = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * Mounted empty and left in the layout: a region that appears with its text already in it may
 * never be announced, and one that appears at all pushes the panel around under the hand.
 */
export function RowNotice({ notice }: { notice: string }) {
  return (
    <p role="status" aria-live="polite" className="mb-2 min-h-5 text-sm text-destructive">
      {notice}
    </p>
  );
}

/** Spec §3's promise in one place: Save and Cancel are always visible while a row is open. */
export function RowActions({
  busy,
  onSave,
  onCancel,
}: {
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <td className="px-3 text-right">
      <div className="flex justify-end gap-2">
        <Button type="button" disabled={busy} aria-busy={busy || undefined} onClick={onSave}>
          Save
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </td>
  );
}
