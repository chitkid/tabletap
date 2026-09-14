/**
 * Prices travel as integer cents everywhere; only the last step turns them into money.
 *
 * `currency` is required, with no default. Every call site has the restaurant's own currency to
 * hand - it rides on the order, on the menu response and into the dashboard - and a `'USD'`
 * default is exactly the debt M5 set out to remove: it makes a missing currency compile, and the
 * wrong symbol only shows up in front of a guest. The compiler is a better guard than a grep.
 *
 * Locale is fixed to `ru-RU`: the product serves one locale, not one per restaurant's currency, so
 * a guest paying in USD still reads "1 250 $" in Russian grouping and symbol placement rather than
 * "$1,250". `maximumFractionDigits: 0` drops kopecks - a menu price is never "1 250,00 ₽" - because
 * every call site of this function is a display figure (menu, basket, receipt, admin dashboard
 * tile), never an amount that is computed further or sent to a payment provider; the integer-cents
 * value behind the string stays exact wherever it is actually used for money.
 */
export function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
