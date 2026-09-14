'use client';
import { Button } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'tt-kitchen-sound';
const listeners = new Set<() => void>();
/** The answer when storage is blocked, so the toggle still works for the shift in front of it. */
let memory = false;

function read(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'on';
  } catch {
    // Storage blocked: the in-memory value is all there is.
  }
  return memory;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another kitchen screen in the same browser is the same shift's choice.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * The preference lives in localStorage, which the server cannot see. Reading it through an
 * external store keeps the server render and the hydrating client render agreed on "off" and
 * lets React pick up the remembered choice immediately afterwards — no read during the first
 * render, and no flash of the wrong label.
 */
export function useSoundPreference(): [boolean, (value: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((value: boolean) => {
    memory = value;
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
    } catch {
      // Storage blocked: the choice holds for this session only.
    }
    for (const listener of [...listeners]) listener();
  }, []);
  return [enabled, set];
}

/** Says its state rather than showing an icon: a cook reads this from a metre away. */
export function SoundToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const t = useTranslations('kitchen.sound');
  return (
    <Button
      type="button"
      variant="outline"
      aria-pressed={enabled}
      onClick={() => onChange(!enabled)}
    >
      {t(enabled ? 'on' : 'off')}
    </Button>
  );
}
