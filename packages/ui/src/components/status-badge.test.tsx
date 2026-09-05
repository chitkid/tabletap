// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('names the status in text and colours it by token class', () => {
    render(<StatusBadge status="cooking" />);
    const badge = screen.getByText('Cooking');
    expect(badge.className).toContain('bg-status-cooking');
    expect(badge.className).toContain('text-foreground');
  });
  it('uses the light foreground on dark statuses', () => {
    render(<StatusBadge status="placed" />);
    expect(screen.getByText('Placed').className).toContain('text-primary-foreground');
  });
  it('names a label colour of its own for the kitchen surface where the fill inverts', () => {
    // The amber fill is mid-dark on the guest surface and light on the kitchen board, so the one
    // label colour that reads on both does not exist. Cooking has to say which it takes where; on
    // the kitchen board `--foreground` is the pale surface ink and the label all but disappears.
    // packages/ui/src/tokens.test.ts is what measures the pairings this names.
    const { container } = render(<StatusBadge status="cooking" />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'dark:text-primary-foreground',
    );
  });
});
