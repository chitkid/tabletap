'use client';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@tabletap/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { authClient } from '../lib/auth-client';

export interface AuthClientLike {
  signIn: {
    email(input: {
      email: string;
      password: string;
    }): Promise<{ error: { status?: number; message?: string } | null }>;
  };
  signOut(): Promise<unknown>;
  useSession(): {
    data: { user: { name: string; role?: string } } | null;
    isPending: boolean;
    refetch?: () => void;
  };
}

type Status = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string };

/** Brand voice: name what happened and what to do, no apology. */
const MESSAGE_BY_STATUS: Record<number, string> = {
  401: "That email and password don't match.",
  429: 'Too many attempts. Wait a minute and try again.',
};
const UNREACHABLE = "Can't reach the server. Check the connection and try again.";

function messageFor(status?: number): string {
  return (status === undefined ? undefined : MESSAGE_BY_STATUS[status]) ?? UNREACHABLE;
}

/** The seeded credentials the landing hands over for a one-click demo sign-in. */
export interface DemoAccount {
  email: string;
  password: string;
  name: string;
}

export function LoginForm({
  client = authClient as unknown as AuthClientLike,
  demo,
  next,
  navigate = (href: string) => window.location.replace(href),
}: {
  client?: AuthClientLike;
  demo?: DemoAccount;
  next: string;
  navigate?: (href: string) => void;
}) {
  const session = client.useSession();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const errorId = useId();

  useEffect(() => {
    if (session.data) navigate(next);
  }, [session.data, navigate, next]);

  // One attempt per mount, whatever the outcome: the effect re-runs on every render (both
  // `demo` and the session object are fresh identities each time), and a failed sign-in that
  // retried itself would hammer the API and lock the visitor out of the fallback form.
  const attempted = useRef(false);
  useEffect(() => {
    if (!demo || attempted.current || session.isPending || session.data) return;
    attempted.current = true;
    setStatus({ kind: 'submitting' });
    void client.signIn
      // `demo` also carries the display name; the credential call gets only the credentials.
      .email({ email: demo.email, password: demo.password })
      .then((result) => {
        if (result.error) {
          setStatus({ kind: 'error', message: messageFor(result.error.status) });
          return;
        }
        setStatus({ kind: 'idle' });
        session.refetch?.();
      })
      .catch(() => setStatus({ kind: 'error', message: UNREACHABLE }));
  }, [client, demo, session]);

  if (session.data) {
    return (
      <p
        role="status"
        aria-live="polite"
      >{`Signed in as ${session.data.user.name}. Opening the kitchen…`}</p>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus({ kind: 'submitting' });
    try {
      const result = await client.signIn.email({
        email: String(data.get('email') ?? ''),
        password: String(data.get('password') ?? ''),
      });
      if (result.error) {
        setStatus({ kind: 'error', message: messageFor(result.error.status) });
        return;
      }
      setStatus({ kind: 'idle' });
      session.refetch?.();
    } catch {
      setStatus({ kind: 'error', message: UNREACHABLE });
    }
  }

  const submitting = status.kind === 'submitting';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff sign in</CardTitle>
        <CardDescription>
          Use the demo accounts from the README. The kitchen board opens after sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {demo && submitting ? (
          <p role="status" aria-live="polite">{`Signing in as ${demo.name}…`}</p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-11"
                aria-describedby={status.kind === 'error' ? errorId : undefined}
                aria-invalid={status.kind === 'error' || undefined}
              />
            </div>
            <p id={errorId} role="status" aria-live="polite" className="min-h-6 text-destructive">
              {status.kind === 'error' ? status.message : ''}
            </p>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
