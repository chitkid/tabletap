'use client';
import { ClaimResponseSchema } from '@tabletap/shared';
import { Button } from '@tabletap/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, clientFetch } from '../lib/api';

const MESSAGE: Record<string, string> = {
  TOKEN_EXPIRED: 'This QR code has expired. Ask staff for a new one.',
  TOKEN_INVALID: 'This QR code is not valid.',
  NOT_FOUND: 'This table is not available right now.',
};
const UNREACHABLE = "Can't reach the server. Check the connection and try again.";

function messageFor(err: unknown): string {
  return err instanceof ApiError ? (MESSAGE[err.code] ?? UNREACHABLE) : UNREACHABLE;
}

export function ClaimTable({ token }: { token: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // `useRouter()` can hand back a fresh object on any render, and naming it as a dependency
  // below would re-run the effect — re-POSTing the claim — every time. Reading it through a ref
  // keeps the promise honest: the table is claimed once per visit, and once more per Try again.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  // `attempt` is the retry trigger: bumping it is what re-runs the claim.
  useEffect(() => {
    let live = true;
    void clientFetch('/api/guest/claim', {
      schema: ClaimResponseSchema,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      },
    })
      .then(() => {
        if (live) routerRef.current.replace('/menu');
      })
      .catch((err: unknown) => {
        if (live) setError(messageFor(err));
      });
    return () => {
      live = false;
    };
  }, [token, attempt]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-3xl font-semibold">Little Furnace</h1>
      {error === null ? (
        <p role="status" aria-live="polite" className="text-muted-foreground">
          Finding your table…
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p role="alert">{error}</p>
          <Button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      )}
    </main>
  );
}
