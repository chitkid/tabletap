/**
 * Motion tokens. The actual durations and the easing curve live in packages/ui/theme.css, under
 * the matching custom properties; this module is the only place a component should read them
 * from, as var() references rather than as literals. scripts/validate-tokens.cjs blocks a bare
 * duration or easing curve everywhere outside theme.css and tokens.css — including in this file,
 * which is why the durations themselves are not repeated in the comments below.
 */
export const MOTION = {
  // A control answering a press.
  fast: 'var(--motion-fast)',
  // Something arriving or leaving.
  base: 'var(--motion-base)',
  // The gap between two entering cards.
  stagger: 'var(--motion-stagger)',
  // Asymmetric on purpose: leaves fast, settles slow, so an arrival reads as arriving.
  ease: 'var(--motion-ease)',
} as const;
