import {
  DemoLinksResponseSchema,
  type DemoLinksResponse,
  type ErrorMessageKey,
} from '@tabletap/shared';
import { ApiError, apiFetch } from './api';

/**
 * Every landing render calls this from the server, so the API sees one ip for every visitor at
 * once. Thirty seconds of memory turns a burst of renders into a single request while still
 * following a demo reset within half a minute. Only a successful answer is remembered: a failure
 * is worth re-asking rather than pinning for the process's life.
 */
const CACHE_MS = 30_000;
let cached: { value: DemoLinksResponse; expiresAt: number } | null = null;

/**
 * The API said nothing at all - the fetch threw, or answered something that was not an envelope.
 * `unreachable` is the one `ErrorMessageKey` the API never sends, for exactly this: an API that
 * cannot be reached cannot name its own refusal, and the landing still has to say something. It
 * resolves through the same `errors.*` block as every key the API does send.
 */
const UNAVAILABLE: ErrorMessageKey = 'unreachable';

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
 *
 * It is a **key**, not a sentence. This module runs on the server with no request context of its
 * own, and the sentence it used to carry was English on a Russian page - the one user-visible
 * English string `apps/web/i18n/no-orphan-strings.test.ts` names and deliberately does not chase,
 * because it lives outside the component tree that gate walks. `LandingContent` resolves the key
 * through the dictionary at the point of render, where the translations are.
 */
export interface DemoLinksResult {
  links: DemoLinksResponse | null;
  notice: ErrorMessageKey | null;
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
    // The English sentence goes to the server's log, where a developer wants it, and no further.
    console.warn('demo links unavailable:', err instanceof Error ? err.message : err);
    // The server named the refusal when it answered at all. A thrown fetch names nothing, and so
    // does an envelope carrying a key this build has never heard of: both take `unreachable`,
    // which is true of each - the API had nothing to say that this page could say on its behalf.
    return {
      links: null,
      notice: err instanceof ApiError ? (err.messageKey ?? UNAVAILABLE) : UNAVAILABLE,
    };
  }
}

/** Demo mode is an API flag; a surface that has nothing to say about a failure takes just this. */
export async function fetchDemoLinks(): Promise<DemoLinksResponse | null> {
  return (await loadDemoLinks()).links;
}
