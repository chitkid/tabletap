import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import ru from '../../messages/ru.json';
import MenuLoading from './loading';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
/** The class list on the first element of a file - the box everything else is measured against. */
const firstBox = (source: string) => /className="([^"]+)"/.exec(source)?.[1];

describe('the menu’s cold start', () => {
  it('says what it is doing instead of showing a wordless grey page', () => {
    render(withProvider(<MenuLoading />));
    expect(screen.getByRole('status')).toHaveTextContent('Открываем меню…');
  });

  it('puts the word inside the box the heading will take, so nothing moves when the menu lands', () => {
    render(withProvider(<MenuLoading />));
    // h-9 is 2.25rem, which is exactly the line box of the `text-3xl` h1 that replaces it. The
    // line is centred inside that box rather than sizing it, so the copy cannot change the height.
    const line = screen.getByText('Открываем меню…');
    expect(line.className).toContain('h-9');
    expect(line.className).not.toMatch(/\bmin-h-/);
  });

  it('reserves the menu screen’s own box, not a box of its own', () => {
    // The deployed page is gated at CLS 0. A loading state whose container differs from the one
    // it is standing in for shifts the whole page the moment the menu arrives, so the two class
    // lists are compared rather than trusted to stay in step by hand.
    expect(firstBox(read('./loading.tsx'))).toBe(
      firstBox(read('../../components/menu/menu-screen.tsx')),
    );
  });

  it('still reserves every block the real menu fills', () => {
    const { container } = render(withProvider(<MenuLoading />));
    expect(container.querySelectorAll('.min-h-32')).toHaveLength(6);
    expect(container.querySelector('.h-11')).not.toBeNull();
  });
});
