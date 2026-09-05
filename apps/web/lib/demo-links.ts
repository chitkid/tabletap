import { DemoLinksResponseSchema, type DemoLinksResponse } from '@tabletap/shared';
import { ApiError, apiFetch } from './api';

/**
 * Every landing render calls this from the server, so the API sees one ip for every visitor at
 * once. Thirty seconds of memory turns a burst of renders into a single request while still
 * following a demo reset within half a minute. Only a successful answer is remembered: a failure
 * is worth re-asking rather than pinning for the process's life.
 */
const CACHE_MS = 30_000;
let cached: { value: DemoLinksResponse; expiresAt: number } | null = null;

const UNAVAILABLE = 'The demo links are unavailable right now.';

/**
 * Two different nulls, and the landing acts on the difference.
 *
 * `notice === null` means there is nothing to say: the API answered 404, which is what demo mode
 * being off and demo data never having been seeded both look like from here, and the landing is a
 * plain product page in that case by design.
 *
 * A `notice` means demo mode is on and the links could not be built anyway - most likely because
 * an admin renumbered or deactivated table 7, which `GET /api/demo/links` answers 409 for. Reading
 * that as "demo mode is off" would take the cards, the QR and the sign-in buttons off the landing
 * with nothing said about why, and one press in the admin can cause it.
 */
export interface DemoLinksResult {
  links: DemoLinksResponse | null;
  notice: string | null;
}

export async function loadDemoLinks(): Promise<DemoLinksResult> {
  if (cached !== null && cached.expiresAt > Date.now())
    return { links: cached.value, notice: null };
  try {
    const links = await apiFetch('/api/demo/links', { schema: DemoLinksResponseSchema });
    cached = { value: links, expiresAt: Date.now() + CACHE_MS };
    return { links, notice: null };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { links: null, notice: null };
    console.warn('demo links unavailable:', err instanceof Error ? err.message : err);
    // The server said it best when it said anything at all; a thrown fetch says only that the API
    // could not be reached, which is not a sentence to put in front of a visitor.
    return { links: null, notice: err instanceof ApiError ? err.message : UNAVAILABLE };
  }
}

/** Demo mode is an API flag; a surface that has nothing to say about a failure takes just this. */
export async function fetchDemoLinks(): Promise<DemoLinksResponse | null> {
  return (await loadDemoLinks()).links;
}
