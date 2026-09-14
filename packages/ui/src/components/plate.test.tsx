// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Plate } from './plate';

describe('Plate', () => {
  it('is an image named after the dish by default', () => {
    render(<Plate name="Хачапури по-аджарски" kind="flatbread" />);
    const svg = screen.getByRole('img', { name: 'Хачапури по-аджарски' });
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });
  it('says nothing when it is decorative', () => {
    const { container } = render(<Plate name="Хачапури по-аджарски" kind="flatbread" decorative />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
    expect(svg?.getAttribute('aria-label')).toBeNull();
    // Scoped to this render: the suite has no auto-cleanup, so the plate above is still mounted.
    expect(within(container).queryByRole('img')).toBeNull();
  });
});
