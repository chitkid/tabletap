import type { ReactNode } from 'react';

export const metadata = { title: 'Kitchen · TableTap' };

/** The attribute switches the token set (dark) and the type scale; the wrapper paints the ground. */
export default function KitchenLayout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="kitchen" className="min-h-dvh bg-background text-foreground">
      {children}
    </div>
  );
}
