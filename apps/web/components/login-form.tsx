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
import { useTranslations } from 'next-intl';
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

/**
 * The refusals this form owns, as **dictionary keys** rather than sentences: a table of English
 * built here and rendered through a variable is English on screen that no JSX text node carries,
 * which is the shape `apps/web/i18n/no-orphan-strings.test.ts` exists to refuse.
 *
 * better-auth answers a wrong password in English over the wire (`result.error.message`); this
 * form has never quoted it and still does not. It reads only the HTTP status, which is a number,
 * and says the rest itself — so a guest's word for a refusal is the copy contract's, not the
 * auth library's. Brand voice: name what happened and what to do, no apology.
 */
const MESSAGE_KEY_BY_STATUS: Record<number, 'wrongCredentials' | 'rateLimited'> = {
  401: 'wrongCredentials',
  429: 'rateLimited',
};

/** A thrown fetch carries no status at all, and an unmapped one is no more legible than none. */
function messageKeyFor(httpStatus?: number): 'wrongCredentials' | 'rateLimited' | 'unreachable' {
  if (httpStatus === undefined) return 'unreachable';
  return MESSAGE_KEY_BY_STATUS[httpStatus] ?? 'unreachable';
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
  const t = useTranslations('login');
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
          setStatus({ kind: 'error', message: t(messageKeyFor(result.error.status)) });
          return;
        }
        setStatus({ kind: 'idle' });
        session.refetch?.();
      })
      .catch(() => setStatus({ kind: 'error', message: t('unreachable') }));
  }, [client, demo, session, t]);

  if (session.data) {
    return (
      <p role="status" aria-live="polite">
        {t('signedInAs', { name: session.data.user.name })}
      </p>
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
        setStatus({ kind: 'error', message: t(messageKeyFor(result.error.status)) });
        return;
      }
      setStatus({ kind: 'idle' });
      session.refetch?.();
    } catch {
      setStatus({ kind: 'error', message: t('unreachable') });
    }
  }

  const submitting = status.kind === 'submitting';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('heading')}</CardTitle>
        <CardDescription>{t('text')}</CardDescription>
      </CardHeader>
      <CardContent>
        {demo && submitting ? (
          <p role="status" aria-live="polite">
            {t('signingInAs', { name: demo.name })}
          </p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t('email')}</Label>
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
              <Label htmlFor="password">{t('password')}</Label>
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
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
