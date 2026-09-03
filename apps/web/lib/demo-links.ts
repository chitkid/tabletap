import { DemoLinksResponseSchema, type DemoLinksResponse } from '@tabletap/shared';
import { ApiError, apiFetch } from './api';

/** Demo mode is an API flag; the landing degrades to a plain product page without it. */
export async function fetchDemoLinks(): Promise<DemoLinksResponse | null> {
  try {
    return await apiFetch('/api/demo/links', { schema: DemoLinksResponseSchema });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    console.warn('demo links unavailable:', err instanceof Error ? err.message : err);
    return null;
  }
}
