import { DemoLinksResponseSchema, type DemoLinksResponse } from '@tabletap/shared';
import { ApiError, apiFetch } from './api';

/**
 * Every landing render calls this from the server, so the API sees one ip for every visitor at
 * once. Thirty seconds of memory turns a burst of renders into a single request while still
 * following a demo reset within half a minute. Only a successful answer is remembered: a 404
 * means demo mode is off, and that is worth re-asking rather than pinning for the process's life.
 */
const CACHE_MS = 30_000;
let cached: { value: DemoLinksResponse; expiresAt: number } | null = null;

/** Demo mode is an API flag; the landing degrades to a plain product page without it. */
export async function fetchDemoLinks(): Promise<DemoLinksResponse | null> {
  if (cached !== null && cached.expiresAt > Date.now()) return cached.value;
  try {
    const links = await apiFetch('/api/demo/links', { schema: DemoLinksResponseSchema });
    cached = { value: links, expiresAt: Date.now() + CACHE_MS };
    return links;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    console.warn('demo links unavailable:', err instanceof Error ? err.message : err);
    return null;
  }
}
