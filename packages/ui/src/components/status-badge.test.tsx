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
});
