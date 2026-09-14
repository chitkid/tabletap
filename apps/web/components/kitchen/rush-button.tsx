'use client';
import { RushResponseSchema } from '@tabletap/shared';
import { Button } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('kitchen.rush');
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

  // Every message has the same shelf life: a board that still reads «12 заказов за ближайшую
  // минуту» - or that a rush failed - ten minutes later is telling the room a lie.
  const clearAfter = (seconds: number) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCooling(false);
      setMessage(null);
    }, seconds * 1_000);
  };
  // The message and the quiet button describe the same rush, so they end together.
  const cool = (seconds: number) => {
    setCooling(true);
    clearAfter(seconds);
  };

  const start = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const rush = await fetcher('/api/demo/rush', {
        schema: RushResponseSchema,
        init: { method: 'POST' },
      });
      // A live count from the API, so the noun after it is declined by ICU and never by a
      // ternary: Russian needs three forms where English needs two.
      setMessage(t('planned', { n: rush.ordersPlanned }));
      cool(rush.durationSeconds);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setMessage(t('running'));
        cool(CONFLICT_COOLDOWN_SECONDS);
      } else {
        // Nothing is running, so the button stays pressable; only the message is on a timer.
        setMessage(t('failed'));
        clearAfter(CONFLICT_COOLDOWN_SECONDS);
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
        {t('start')}
      </Button>
      {message !== null ? (
        <p role="status" aria-live="polite" className="text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
