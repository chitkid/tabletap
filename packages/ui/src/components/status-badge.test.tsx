// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('names the status in text and colours it by token class', () => {
    render(<StatusBadge status="cooking" label="Готовится" />);
    const badge = screen.getByText('Готовится');
    expect(badge.className).toContain('bg-status-cooking');
    expect(badge.className).toContain('text-foreground');
  });
  it('uses the light foreground on dark statuses', () => {
    render(<StatusBadge status="placed" label="Ожидает оплаты" />);
    expect(screen.getByText('Ожидает оплаты').className).toContain('text-primary-foreground');
  });
  it('names a label colour of its own for the kitchen surface where the fill inverts', () => {
    // The amber fill is mid-dark on the guest surface and light on the kitchen board, so the one
    // label colour that reads on both does not exist. Cooking has to say which it takes where; on
    // the kitchen board `--foreground` is the pale surface ink and the label all but disappears.
    // packages/ui/src/tokens.test.ts is what measures the pairings this names.
    const { container } = render(<StatusBadge status="cooking" label="Готовится" />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'dark:text-primary-foreground',
    );
  });
  it('takes the same status under two different words, because the surfaces do not agree', () => {
    // The glossary's whole point: `ready` is «Готов — сейчас принесут» to a guest and «Готов» to
    // the kitchen. A badge that owned one word for both would have to pick a surface to be wrong
    // on, so it owns neither - docs/design/02b-copy-ru.md.
    const { rerender, container } = render(
      <StatusBadge status="ready" label="Готов — сейчас принесут" />,
    );
    expect(container.textContent).toBe('Готов — сейчас принесут');
    rerender(<StatusBadge status="ready" label="Готов" />);
    expect(container.textContent).toBe('Готов');
    expect((container.firstElementChild as HTMLElement).className).toContain('bg-status-ready');
  });
});
