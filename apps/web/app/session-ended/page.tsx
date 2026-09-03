import Link from 'next/link';

export const metadata = { title: 'Session ended · TableTap' };

export default function SessionEndedPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-3xl font-semibold">Your session has ended.</h1>
      <p>Scan the QR code on your table to start again.</p>
      <Link href="/" className="underline underline-offset-4">
        Back to the start
      </Link>
    </main>
  );
}
