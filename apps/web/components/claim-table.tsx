'use client';
import { ClaimResponseSchema } from '@tabletap/shared';
import { Button } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, clientFetch } from '../lib/api';

/** Which sentence in `guest.claim` a refusal earns; the words live in the dictionary. */
type MessageKey = 'expired' | 'invalid' | 'notFound' | 'unreachable';
const MESSAGE_KEY: Record<string, MessageKey> = {
  TOKEN_EXPIRED: 'expired',
  TOKEN_INVALID: 'invalid',
  NOT_FOUND: 'notFound',
};

function messageKeyFor(err: unknown): MessageKey {
  return err instanceof ApiError ? (MESSAGE_KEY[err.code] ?? 'unreachable') : 'unreachable';
}

export function ClaimTable({ token }: { token: string }) {
  const t = useTranslations('guest.claim');
  const brand = useTranslations('landing');
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  // `useRouter()` can hand back a fresh object on any render, and naming it as a dependency
  // below would re-run the effect — re-POSTing the claim — every time. Reading it through a ref
  // keeps the promise honest: the table is claimed once per visit, and once more per Try again.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  // Claiming is a POST that mints a guest session, so it has to survive being asked twice.
  // StrictMode runs every effect mount → cleanup → mount in development, and a second claim
  // cannot see the cookie the first one is still setting: the guest would end up with two
  // sessions. `fired` records which attempt has already gone out and is never reset by the
  // cleanup, so a same-attempt re-invocation is a no-op while Try again, which bumps `attempt`,
  // still sends a fresh claim.
  const fired = useRef(-1);
  const alive = useRef(true);

  // `attempt` is the retry trigger: bumping it is what re-runs the claim.
  useEffect(() => {
    // Re-arm before the guard: StrictMode's throwaway cleanup must not strand the one request
    // that is genuinely in flight.
    alive.current = true;
    const stop = () => {
      alive.current = false;
    };
    if (fired.current === attempt) return stop;
    fired.current = attempt;
    void clientFetch('/api/guest/claim', {
      schema: ClaimResponseSchema,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      },
    })
      .then(() => {
        if (alive.current) routerRef.current.replace('/menu');
      })
      .catch((err: unknown) => {
        if (alive.current) setErrorKey(messageKeyFor(err));
      });
    return stop;
  }, [token, attempt]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-3xl font-semibold">{brand('brand')}</h1>
      {errorKey === null ? (
        <p role="status" aria-live="polite" className="text-muted-foreground">
          {t('finding')}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p role="alert">{t(errorKey)}</p>
          <Button
            type="button"
            onClick={() => {
              setErrorKey(null);
              setAttempt((n) => n + 1);
            }}
          >
            {t('retry')}
          </Button>
          {/* Try again cannot mend an expired code or a table that is gone, and this screen is
              the whole app for a guest who arrived by scanning: give it an exit. */}
          <Link href="/" className="underline underline-offset-4">
            {t('home')}
          </Link>
        </div>
      )}
    </main>
  );
}
