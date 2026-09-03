'use client';
import { RushResponseSchema } from '@tabletap/shared';
import { Button } from '@tabletap/ui';
import { useEffect, useRef, useState } from 'react';
import { ApiError, clientFetch } from '../../lib/api';

/** How long a refused rush keeps the button quiet: the server's own rush window. */
const CONFLICT_COOLDOWN_SECONDS = 60;

/**
 * Demo mode only: asks the API to place a minute of orders so the board has something to do.
 * The button goes quiet for the length of the rush, because a second rush on top of the first
 * is refused by the API anyway and a control that only ever fails is worse than a disabled one.
 */
export function RushButton({ fetcher = clientFetch }: { fetcher?: typeof clientFetch }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooling, setCooling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  // The message and the quiet button describe the same rush, so they end together: a board that
  // still reads "12 orders over the next minute" ten minutes later is telling the room a lie.
  const cool = (seconds: number) => {
    setCooling(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCooling(false);
      setMessage(null);
    }, seconds * 1_000);
  };

  const start = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const rush = await fetcher('/api/demo/rush', {
        schema: RushResponseSchema,
        init: { method: 'POST' },
      });
      setMessage(`${rush.ordersPlanned} orders over the next minute.`);
      cool(rush.durationSeconds);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setMessage('A rush is already running.');
        cool(CONFLICT_COOLDOWN_SECONDS);
      } else {
        setMessage("Couldn't start a rush.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        disabled={busy || cooling}
        aria-busy={busy}
        onClick={() => void start()}
      >
        Simulate rush
      </Button>
      {message !== null ? (
        <p role="status" aria-live="polite" className="text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
