'use client';
import { cn } from '@tabletap/ui';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * Which routes have already arrived in this document. Someone coming back to the menu from the
 * basket has seen it and is not arriving; only the first paint of a route is an arrival. A reload
 * counts as one again, because the document — and this set with it — is new.
 */
const arrived = new Set<string>();

/**
 * The cascade, as one string, so no caller can hold half of it. It lands on the wrapper's
 * grandchildren: the wrapper sits outside a component that owns its own layout element, and it is
 * that element's children — the cards on the landing, the sections on the menu — that arrive one
 * after another.
 *
 * `starting:` is `@starting-style`, so the faded state exists only for the instant an element is
 * inserted. The served HTML therefore carries no `opacity-0`, which is what keeps a browser that
 * never ran the JavaScript from being handed an invisible page, and what stops a re-render from
 * fading an element that is already on screen back in.
 *
 * Nothing past the fourth child waits longer than the fourth does: a stagger that keeps counting
 * turns a long menu into a queue.
 */
const CASCADE = [
  '[&>*>*]:transition-[opacity,translate]',
  '[&>*>*]:duration-[var(--motion-base)]',
  '[&>*>*]:ease-[var(--motion-ease)]',
  '[&>*>*]:starting:translate-y-2',
  '[&>*>*]:starting:opacity-0',
  '[&>*>*:nth-child(2)]:delay-[calc(var(--motion-stagger)*1)]',
  '[&>*>*:nth-child(3)]:delay-[calc(var(--motion-stagger)*2)]',
  '[&>*>*:nth-child(n+4)]:delay-[calc(var(--motion-stagger)*3)]',
].join(' ');

/**
 * The entrance a stranger sees on the page they land on: it assembles itself, once. Nothing here
 * decides what reduced motion means — apps/web/app/globals.css collapses every duration in the
 * product in one rule, and a second opinion in a component could only drift from it.
 */
export function Entrance({ route, children }: { route: string; children: ReactNode }) {
  // Read before the effect below records the route, and read once: a re-render must not take the
  // cascade off an element that is still on its way in.
  const [first] = useState(() => !arrived.has(route));
  useEffect(() => {
    arrived.add(route);
  }, [route]);
  return (
    <div data-entrance={route} className={cn(first && CASCADE)}>
      {children}
    </div>
  );
}
