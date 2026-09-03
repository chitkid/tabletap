import { describe, expect, it } from 'vitest';
import { OrderEvents } from './order-events';

describe('OrderEvents', () => {
  it('is a typed emitter with the three M3 events', () => {
    const events = new OrderEvents();
    const seen: string[] = [];
    events.on('order:created', (o) => seen.push(`created:${o.id}`));
    events.on('demo:reset', () => seen.push('reset'));
    events.emit('order:created', { id: 'a' } as never);
    events.emit('demo:reset');
    expect(seen).toEqual(['created:a', 'reset']);
  });
});
