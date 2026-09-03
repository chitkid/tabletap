import { StaffRoleSchema } from '@tabletap/shared';
import { LoginForm } from '../../components/login-form';
import { fetchDemoLinks } from '../../lib/demo-links';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const role = StaffRoleSchema.safeParse(demo);
  const links = role.success ? await fetchDemoLinks() : null;
  const account = links?.staff.find((s) => s.role === role.data) ?? null;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-3xl font-semibold">TableTap</h1>
      <LoginForm
        demo={
          account
            ? { email: account.email, password: account.password, name: account.name }
            : undefined
        }
      />
    </main>
  );
}
