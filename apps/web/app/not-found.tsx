import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-3xl font-semibold">Nothing here.</h1>
      <p>The link may be old or mistyped.</p>
      <Link href="/" className="underline underline-offset-4">
        Back to the start
      </Link>
    </main>
  );
}
