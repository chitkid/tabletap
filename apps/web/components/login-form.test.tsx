import { render as rtlRender, screen, waitFor, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlMessageFormat } from 'intl-messageformat';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ru from '../messages/ru.json';
import { LoginForm, type AuthClientLike } from './login-form';

const withIntl = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: ReactElement, options?: RenderOptions) =>
  rtlRender(ui, { wrapper: withIntl, ...options });

/**
 * Every word here is read out of `messages/ru.json`, never retyped: the sign-in copy binds «и» and
 * «не» to the word after them with U+00A0, and a hand-typed plain space would make these
 * assertions stop asserting while still passing. `getByRole(…, { name })` compares the accessible
 * name with an identity normaliser, so it takes the dictionary's bytes as they are;
 * `toHaveTextContent` and `getByText` collapse U+00A0 to a plain space in the *element* and leave
 * the expected string alone, so those take `plain()`.
 *
 * **`plain()` belongs to a matcher, not to a sentence.** The first version of this file wrote
 * `expect(alert.textContent).not.toContain(plain(L.wrongCredentials))`, and that assertion cannot
 * fail: `.textContent` is raw and still carries three U+00A0, while `plain()` had already taken
 * them out of the needle, so `raw.includes(plain(raw))` is false whatever the component renders.
 * A *negative* assertion is where this is silent — a positive one would have gone red on the first
 * run. Nothing in this file compares against a raw `.textContent` any more, and
 * `apps/web/i18n/no-mixed-normalisation.test.ts` now refuses the shape across the suite.
 */
const L = ru.login;
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string>) =>
  String(new IntlMessageFormat(message, 'ru-RU').format(values));

function makeClient(over: Partial<AuthClientLike> = {}): AuthClientLike {
  return {
    signIn: { email: vi.fn(async () => ({ error: null })) },
    signOut: vi.fn(async () => undefined),
    useSession: () => ({ data: null, isPending: false }),
    ...over,
  };
}

const typeCredentials = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(L.email), 'a@b.c');
  await user.type(screen.getByLabelText(L.password), 'x');
  await user.click(screen.getByRole('button', { name: L.submit }));
};

describe('LoginForm', () => {
  it('submits email and password', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    render(<LoginForm client={client} next="/kitchen" />);
    await user.type(screen.getByLabelText(L.email), 'kitchen@littlefurnace.demo');
    await user.type(screen.getByLabelText(L.password), 'tabletap-demo');
    await user.click(screen.getByRole('button', { name: L.submit }));
    expect(client.signIn.email).toHaveBeenCalledWith({
      email: 'kitchen@littlefurnace.demo',
      password: 'tabletap-demo',
    });
  });
  it('says a wrong password in the contract’s words, not in better-auth’s', async () => {
    const user = userEvent.setup();
    const client = makeClient({
      // better-auth answers in English over the wire. The form reads the status and says the rest
      // itself, so this English must not reach the screen — Task 12 owns what the API does send.
      signIn: {
        email: vi.fn(async () => ({ error: { status: 401, message: 'Invalid password' } })),
      },
    });
    render(<LoginForm client={client} next="/kitchen" />);
    await typeCredentials(user);
    const alert = await screen.findByRole('status');
    expect(alert).toHaveTextContent(plain(L.wrongCredentials));
    expect(alert).not.toHaveTextContent('Invalid password');
    expect(screen.getByLabelText(L.password)).toHaveAttribute('aria-describedby', alert.id);
  });
  it('names the rate limit on a 429, and not the same sentence as a wrong password', async () => {
    const user = userEvent.setup();
    const client = makeClient({
      signIn: {
        email: vi.fn(async () => ({ error: { status: 429, message: 'Too many requests' } })),
      },
    });
    render(<LoginForm client={client} next="/kitchen" />);
    await typeCredentials(user);
    const alert = await screen.findByRole('status');
    expect(alert).toHaveTextContent(plain(L.rateLimited));
    expect(alert).not.toHaveTextContent(plain(L.wrongCredentials));
  });
  it('shows the network message when the request never reached a status', async () => {
    const user = userEvent.setup();
    const client = makeClient({
      signIn: {
        email: vi.fn(async () => {
          throw new Error('offline');
        }),
      },
    });
    render(<LoginForm client={client} next="/kitchen" />);
    await typeCredentials(user);
    expect(await screen.findByRole('status')).toHaveTextContent(plain(L.unreachable));
  });
  it('disables the button while submitting', async () => {
    const user = userEvent.setup();
    let resolve!: (v: { error: null }) => void;
    const client = makeClient({
      signIn: {
        email: vi.fn(
          () =>
            new Promise<{ error: null }>((r) => {
              resolve = r;
            }),
        ),
      },
    });
    render(<LoginForm client={client} next="/kitchen" />);
    await typeCredentials(user);
    expect(screen.getByRole('button', { name: L.submitting })).toBeDisabled();
    resolve({ error: null });
    await waitFor(() => expect(screen.getByRole('button', { name: L.submit })).toBeEnabled());
  });
  it('navigates to `next` once the session resolves', async () => {
    const navigate = vi.fn();
    const client = makeClient({
      useSession: () => ({
        data: { user: { name: 'Тимофей Басов', role: 'kitchen' } },
        isPending: false,
      }),
    });
    render(<LoginForm client={client} next="/kitchen" navigate={navigate} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      plain(fill(L.signedInAs, { name: 'Тимофей Басов' })),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/kitchen'));
  });
  it('signs in once with the demo credentials and shows who it is signing in as', async () => {
    const email = vi.fn(async () => ({ error: null }));
    const client = makeClient({ signIn: { email } });
    render(
      <LoginForm
        client={client}
        next="/kitchen"
        demo={{
          email: 'kitchen@littlefurnace.demo',
          password: 'tabletap-demo',
          name: 'Тимофей Басов',
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      plain(fill(L.signingInAs, { name: 'Тимофей Басов' })),
    );
    await waitFor(() =>
      expect(email).toHaveBeenCalledWith({
        email: 'kitchen@littlefurnace.demo',
        password: 'tabletap-demo',
      }),
    );
    expect(email).toHaveBeenCalledTimes(1);
  });
  it('falls back to the form when the demo sign-in fails', async () => {
    const client = makeClient({
      signIn: { email: vi.fn(async () => ({ error: { status: 401 } })) },
    });
    render(
      <LoginForm
        client={client}
        next="/kitchen"
        demo={{ email: 'x@y.z', password: 'p', name: 'X' }}
      />,
    );
    expect(await screen.findByText(plain(L.wrongCredentials))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: L.submit })).toBeInTheDocument();
  });
});
