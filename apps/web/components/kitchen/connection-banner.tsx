import { cn } from '@tabletap/ui';

export type ConnectionState = 'connecting' | 'online' | 'offline';

const MESSAGE: Record<Exclude<ConnectionState, 'online'>, string> = {
  connecting: 'Connecting to the kitchen feed…',
  offline: 'Reconnecting… the board will catch up.',
};

/**
 * A connected board says nothing — but the band keeps its place. Taking it out of the flow when the
 * socket connected was the whole of `/kitchen`'s 0.044 cumulative layout shift: the board jumped up
 * a line the moment the feed came online, every load, under the hand of a cook already reaching for
 * a ticket. The online state is the same box, laid out and painting nothing, holding the height its
 * own message would need. It carries no live region and no text an assistive tech can reach, so a
 * board with nothing wrong with it still announces nothing.
 */
export function ConnectionBanner({ state }: { state: ConnectionState }) {
  const online = state === 'online';
  return (
    <p
      role={online ? undefined : 'status'}
      aria-live={online ? undefined : 'polite'}
      aria-hidden={online || undefined}
      className={cn('px-6 py-2', online ? 'invisible' : 'bg-secondary text-secondary-foreground')}
    >
      {online ? MESSAGE.connecting : MESSAGE[state]}
    </p>
  );
}
