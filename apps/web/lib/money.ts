/**
 * Prices travel as integer cents everywhere; only the last step turns them into money.
 *
 * `currency` is required, with no default. Every call site has the restaurant's own currency to
 * hand - it rides on the order, on the menu response and into the dashboard - and a `'USD'`
 * default is exactly the debt M5 set out to remove: it makes a missing currency compile, and the
 * wrong symbol only shows up in front of a guest. The compiler is a better guard than a grep.
 */
export function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
