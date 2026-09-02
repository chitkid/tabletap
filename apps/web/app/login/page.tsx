import { LoginForm } from '../../components/login-form';

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-3xl font-semibold">TableTap</h1>
      <LoginForm />
    </main>
  );
}
