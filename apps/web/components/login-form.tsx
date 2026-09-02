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
import { useId, useState, type FormEvent } from 'react';
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

export function LoginForm({
  client = authClient as unknown as AuthClientLike,
}: {
  client?: AuthClientLike;
}) {
  const session = client.useSession();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const errorId = useId();

  if (session.data) {
    const { name, role } = session.data.user;
    return (
      <Card>
        <CardHeader>
          <CardTitle>{`Signed in as ${name} (${role ?? 'staff'})`}</CardTitle>
          <CardDescription>
            Kitchen and admin screens arrive in the next milestones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void client.signOut().then(() => session.refetch?.())}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
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
        setStatus({
          kind: 'error',
          message:
            result.error.status === 401
              ? "That email and password don't match."
              : "Can't reach the server. Check the connection and try again.",
        });
        return;
      }
      setStatus({ kind: 'idle' });
      session.refetch?.();
    } catch {
      setStatus({
        kind: 'error',
        message: "Can't reach the server. Check the connection and try again.",
      });
    }
  }

  const submitting = status.kind === 'submitting';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff sign in</CardTitle>
        <CardDescription>Use the demo accounts from the README.</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
