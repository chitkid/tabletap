// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Mark } from './mark';

describe('Mark', () => {
  it('is an image named by title when one is given', () => {
    render(<Mark title="TableTap" />);
    const svg = screen.getByRole('img', { name: 'TableTap' });
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });

  it('says nothing when no title is given', () => {
    const { container } = render(<Mark />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
    expect(svg?.getAttribute('aria-label')).toBeNull();
  });

  it('colours the dot with the primary token and the ring with currentColor', () => {
    const { container } = render(<Mark title="TableTap" />);
    const ring = container.querySelector('circle[stroke-dasharray]');
    const dot = container.querySelector('circle:not([stroke-dasharray])');
    expect(dot?.getAttribute('fill')).toBe('var(--primary)');
    expect(ring?.getAttribute('stroke')).toBe('currentColor');
  });

  it('contains no literal hex colour', () => {
    const { container } = render(<Mark title="TableTap" />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
