import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm, type AuthClientLike } from './login-form';

function makeClient(over: Partial<AuthClientLike> = {}): AuthClientLike {
  return {
    signIn: { email: vi.fn(async () => ({ error: null })) },
    signOut: vi.fn(async () => undefined),
    useSession: () => ({ data: null, isPending: false }),
    ...over,
  };
}

describe('LoginForm', () => {
  it('submits email and password', async () => {
    const client = makeClient();
    render(<LoginForm client={client} />);
    await userEvent.type(screen.getByLabelText('Email'), 'kitchen@littlefurnace.demo');
    await userEvent.type(screen.getByLabelText('Password'), 'tabletap-demo');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(client.signIn.email).toHaveBeenCalledWith({
      email: 'kitchen@littlefurnace.demo',
      password: 'tabletap-demo',
    });
  });
  it('shows the brand-voice message on a 401', async () => {
    const client = makeClient({
      signIn: { email: vi.fn(async () => ({ error: { status: 401, message: 'Invalid' } })) },
    });
    render(<LoginForm client={client} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const alert = await screen.findByRole('status');
    expect(alert).toHaveTextContent("That email and password don't match.");
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', alert.id);
  });
  it('names the rate limit on a 429', async () => {
    const client = makeClient({
      signIn: {
        email: vi.fn(async () => ({ error: { status: 429, message: 'Too many requests' } })),
      },
    });
    render(<LoginForm client={client} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Too many attempts. Wait a minute and try again.',
    );
  });
  it('shows a network message on other failures', async () => {
    const client = makeClient({
      signIn: {
        email: vi.fn(async () => {
          throw new Error('offline');
        }),
      },
    });
    render(<LoginForm client={client} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      "Can't reach the server. Check the connection and try again.",
    );
  });
  it('disables the button while submitting', async () => {
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
    render(<LoginForm client={client} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    resolve({ error: null });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
  });
  it('renders the signed-in state with a sign out button', async () => {
    const client = makeClient({
      useSession: () => ({
        data: { user: { name: 'Theo Baptiste', role: 'kitchen' } },
        isPending: false,
      }),
    });
    render(<LoginForm client={client} />);
    expect(screen.getByText('Signed in as Theo Baptiste (kitchen)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(client.signOut).toHaveBeenCalled();
  });
  it('signs in once with the demo credentials and shows who it is signing in as', async () => {
    const email = vi.fn(async () => ({ error: null }));
    const client = makeClient({ signIn: { email } });
    render(
      <LoginForm
        client={client}
        demo={{
          email: 'kitchen@littlefurnace.demo',
          password: 'tabletap-demo',
          name: 'Theo Baptiste',
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Signing in as Theo Baptiste…');
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
    render(<LoginForm client={client} demo={{ email: 'x@y.z', password: 'p', name: 'X' }} />);
    expect(await screen.findByText("That email and password don't match.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
