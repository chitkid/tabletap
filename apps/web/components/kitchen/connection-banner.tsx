export type ConnectionState = 'connecting' | 'online' | 'offline';

const MESSAGE: Record<Exclude<ConnectionState, 'online'>, string> = {
  connecting: 'Connecting to the kitchen feed…',
  offline: 'Reconnecting… the board will catch up.',
};

/** A connected board says nothing: the band is only there while the feed is not. */
export function ConnectionBanner({ state }: { state: ConnectionState }) {
  if (state === 'online') return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className="bg-secondary px-6 py-2 text-secondary-foreground"
    >
      {MESSAGE[state]}
    </p>
  );
}
