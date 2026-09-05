import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Entrance } from './entrance';

/** Two paints of one route, each with its own wrapper, so the second can be read on its own. */
const paint = (route: string) =>
  render(
    <Entrance route={route}>
      <div>
        <p>one</p>
        <p>two</p>
        <p>three</p>
      </div>
    </Entrance>,
  ).container.querySelector(`[data-entrance="${route}"]`);

describe('Entrance', () => {
  it('carries the cascade on the first paint of a route and not on the second (class-level: jsdom does no layout, so this proves the classes are there, not that anything moved)', () => {
    const route = 'first-paint';
    expect(paint(route)?.className).toContain('starting:opacity-0');
    expect(paint(route)?.className).toBe('');
  });
  it('takes its duration, easing and stagger from the motion tokens rather than from literals', () => {
    const className = paint('tokens')?.className ?? '';
    expect(className).toContain('duration-[var(--motion-base)]');
    expect(className).toContain('ease-[var(--motion-ease)]');
    expect(className).toContain('delay-[calc(var(--motion-stagger)*1)]');
    // Any bare duration would be a second copy of a token this file cannot see change.
    expect(className).not.toMatch(/\d+(?:ms|s)\b/);
  });
  it('moves nothing but opacity and transform, so a cascading page still shifts no layout', () => {
    const className = paint('composited')?.className ?? '';
    expect(className).toContain('transition-[opacity,translate]');
    expect(className).not.toMatch(/transition-(?:all|\[[^\]]*(?:height|width|margin|top)]?)/);
  });
});
