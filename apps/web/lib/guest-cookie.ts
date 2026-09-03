import { cookies } from 'next/headers';
import { GUEST_COOKIE } from './api';

/**
 * Server-only: `next/headers` cannot be bundled for the browser, which is why this lives
 * beside the isomorphic client rather than inside it.
 */
export async function guestCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(GUEST_COOKIE)?.value ?? null;
}
