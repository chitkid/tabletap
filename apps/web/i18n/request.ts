import { getRequestConfig } from 'next-intl/server';

/**
 * One locale, no routing segment. A `/ru` prefix would change every public URL, and the master
 * brief forbids inventing URLs without a decision of its own. `en.json` exists as a fallback file
 * and as the seed of a future switcher, not as a route.
 */
export default getRequestConfig(async () => ({
  locale: 'ru',
  messages: (await import('../messages/ru.json')).default,
}));
