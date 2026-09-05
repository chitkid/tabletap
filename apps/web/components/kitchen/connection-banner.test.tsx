import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConnectionBanner, type ConnectionState } from './connection-banner';

const bandOf = (state: ConnectionState) =>
  render(<ConnectionBanner state={state} />).container.firstElementChild as HTMLElement;

/** The padding is what makes the band a band; the rest of the classes are what it paints. */
const layoutOf = (el: HTMLElement) =>
  el.className
    .split(' ')
    .filter((c) => c.startsWith('px-') || c.startsWith('py-'))
    .sort();

describe('ConnectionBanner', () => {
  it('says what is wrong while the feed is not up', () => {
    expect(bandOf('connecting')).toHaveTextContent('Connecting to the kitchen feed…');
    expect(bandOf('offline')).toHaveTextContent('Reconnecting… the board will catch up.');
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });
  /**
   * Removing the band from the flow when the socket connected was worth 0.044 of cumulative layout
   * shift on the kitchen board: the whole board jumped up the moment the feed came online. The
   * online state is the same box with nothing drawn in it.
   */
  it('keeps its place in the flow once the feed is online, so the board does not jump', () => {
    const online = bandOf('online');
    const connecting = bandOf('connecting');
    expect(online).not.toBeNull();
    expect(layoutOf(online)).toEqual(layoutOf(connecting));
    expect(online.textContent).toBe(connecting.textContent);
    expect(online.className).toContain('invisible');
  });
  it('says nothing at all to assistive tech while the feed is online', () => {
    const online = bandOf('online');
    expect(online).toHaveAttribute('aria-hidden', 'true');
    expect(online).not.toHaveAttribute('role');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
