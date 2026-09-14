'use client';
import { Button } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
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

/**
 * How an expanded panel opens — and only the panel. The row above it keeps `ROW_LINE`'s height in
 * both modes, which is what stops the table jumping under the hand that pressed Edit. `starting:`
 * is `@starting-style`, so the faded state exists only for the instant the panel is inserted, and
 * only opacity and transform move: the rows below end up exactly where they would have anyway.
 *
 * It lives here beside `RowActions` and `RowNotice` because all three in-place editors on the admin
 * surface use it. A screen where one panel fades in while the one beside it appears reads as
 * unfinished, and three copies of this string is how that happens.
 */
export const PANEL_OPENS =
  'transition-[opacity,translate] duration-[var(--motion-base)] ease-[var(--motion-ease)] starting:-translate-y-1 starting:opacity-0';

/**
 * One convention for the whole admin surface: a field that is fine carries no `aria-invalid` at
 * all, rather than `aria-invalid="false"`. Both are correct to a screen reader; having two of them
 * across five inputs in three files is the drift this module exists to stop.
 */
export const invalidAttr = (when: boolean): true | undefined => when || undefined;

/** The acts an operator can have refused. Each one is a key under `admin.refusal.verb`. */
export type RefusalVerb = 'save' | 'delete' | 'activate' | 'deactivate' | 'reissueCode';

/**
 * What went wrong, and then whatever the server said, because the server said it best.
 *
 * **Half of this sentence is Russian and half of it is not, on purpose.** The frame and the verb
 * come from `admin.refusal`; `error.message` is the API's own English sentence, passed through
 * exactly as it arrived. The API has no message keys yet — that is Task 12 of this milestone,
 * which gives all 53 `AppError` call sites one — and writing a Russian sentence here would put
 * words in the API's mouth that it never said. When those keys land, the second half is resolved
 * from them and this interpolation keeps working unchanged.
 *
 * `verb` is the caller's, because this is reused by controls that are not saves: a refused
 * «Отключить» and a refused «Перевыпустить QR-код» would both read «Не удалось сохранить.»
 * otherwise, which describes an act the operator never asked for. Defaulted rather than required
 * so the row editors - which are saves - read the way they always did.
 *
 * A hook rather than a function because the words are in the dictionary; every call site is a
 * client component that already renders inside `NextIntlClientProvider`.
 */
export function useRefusal() {
  const t = useTranslations('admin.refusal');
  /** A refusal the server explained, or one it did not. */
  const refuse = (error: unknown, verb: RefusalVerb = 'save') =>
    error instanceof ApiError
      ? t('withReason', { verb: t(`verb.${verb}`), message: error.message })
      : t('tryAgain', { verb: t(`verb.${verb}`) });
  /**
   * A refused delete. `IN_USE` is the one failure with a way out, and the way out differs by row —
   * empty the category, or mark the dish sold out — so the caller supplies that sentence in the
   * operator's words rather than passing the server's own along.
   */
  const refuseDelete = (error: unknown, inUse: string) =>
    error instanceof ApiError && error.code === 'IN_USE' ? inUse : refuse(error, 'delete');
  return { refuse, refuseDelete };
}

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
  const t = useTranslations('admin.actions');
  return (
    <td className="px-3 text-right">
      <div className="flex justify-end gap-2">
        <Button type="button" disabled={busy} aria-busy={busy || undefined} onClick={onSave}>
          {t('save')}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </td>
  );
}
