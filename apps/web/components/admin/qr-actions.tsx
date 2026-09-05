'use client';
import { TableResponseSchema, type TableDto } from '@tabletap/shared';
import { Button } from '@tabletap/ui';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { clientFetch } from '../../lib/api';
import { refusal } from './row-editor';

const question = (number: number) =>
  `Reissue the QR for table ${number}? Every printed code for this table stops working immediately.`;
const reissued = (number: number) => `Table ${number} has a new code. Print the sheet again.`;

/**
 * The reissue, and the question it has to ask first.
 *
 * It opens no dialog. The same in-place idea as the menu row: the controls are swapped for the
 * question where they stood, so nothing covers the row an operator is looking at and nothing else
 * on that row can be pressed by mistake while the question stands. That matters here more than it
 * does on the menu, because this is the one control on the screen that cannot be undone — every
 * card already printed and stuck to the table stops working the moment the server answers — so the
 * question names the table and states the consequence before either answer is offered.
 *
 * `children` are the row's other controls; they leave with the button and come back with it.
 */
export function QrActions({
  table,
  fetcher = clientFetch,
  children,
}: {
  table: TableDto;
  fetcher?: typeof clientFetch;
  children?: ReactNode;
}) {
  const questionId = useId();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const reissue = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  // Both answers replace the control focus was on. Asking moves it to the safe answer; either
  // answer hands it back to the control that asked, so a keyboard carries on down the table.
  const asked = useRef(false);

  useEffect(() => {
    if (confirming) keep.current?.focus();
    else if (asked.current) reissue.current?.focus();
  }, [confirming]);

  const send = async () => {
    setBusy(true);
    try {
      await fetcher(`/api/tables/${table.id}/qr`, {
        schema: TableResponseSchema,
        init: { method: 'POST' },
      });
      setNotice(reissued(table.number));
    } catch (error) {
      // The old code is still the live one: say what was refused and leave the control as it was.
      // Named for the act, not for a save: nothing was being saved and no editor was open.
      setNotice(refusal(error, 'reissue the code'));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center justify-end gap-2"
      // The way out that costs nothing to reach. Keeping the current code is the safe answer, so
      // the key that means "I did not mean this" has to give it without hunting for a control.
      onKeyDown={(event) => {
        if (confirming && !busy && event.key === 'Escape') setConfirming(false);
      }}
    >
      {/* Mounted by the question, before the sentence that follows it exists: a live region that
          appears with its text already in it may never be announced. `basis-full` keeps a sentence
          on a line of its own instead of wrapping it through the controls beside it. */}
      {confirming || notice !== '' ? (
        <p role="status" aria-live="polite" className="basis-full text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {confirming ? (
        <>
          <p id={questionId} className="basis-full text-sm text-foreground">
            {question(table.number)}
          </p>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            aria-busy={busy || undefined}
            aria-describedby={questionId}
            onClick={() => void send()}
          >
            Yes, reissue
          </Button>
          <Button
            type="button"
            ref={keep}
            variant="ghost"
            disabled={busy}
            aria-describedby={questionId}
            onClick={() => setConfirming(false)}
          >
            Keep the current code
          </Button>
        </>
      ) : (
        <>
          {children}
          <Button
            type="button"
            ref={reissue}
            variant="outline"
            onClick={() => {
              asked.current = true;
              setNotice('');
              setConfirming(true);
            }}
          >
            Reissue QR
          </Button>
        </>
      )}
    </div>
  );
}
