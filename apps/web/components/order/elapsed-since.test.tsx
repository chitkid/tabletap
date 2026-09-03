import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElapsedSince } from './elapsed-since';
describe('ElapsedSince', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T10:02:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  it('shows and updates the elapsed time in a live region', () => {
    render(<ElapsedSince iso="2026-09-03T10:00:00.000Z" intervalMs={1000} />);
    expect(screen.getByRole('status')).toHaveTextContent('Placed 2 min ago');
    vi.advanceTimersByTime(60_000);
    expect(screen.getByRole('status')).toHaveTextContent('Placed 3 min ago');
  });
});
