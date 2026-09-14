import { schema, type Db } from '@tabletap/db';
import type { Principal } from '@tabletap/shared';
import { AppError } from './errors';

/** Single-tenant today: staff see the only restaurant; guests are pinned to theirs by the session. */
export async function restaurantIdFor(db: Db, principal: Principal): Promise<string> {
  if (principal.kind === 'guest') return principal.restaurantId;
  if (principal.kind === 'anonymous')
    throw new AppError('UNAUTHORIZED', 401, 'signInRequired', 'Sign in to continue.');
  const [row] = await db.select({ id: schema.restaurants.id }).from(schema.restaurants).limit(1);
  if (!row)
    throw new AppError('NOT_FOUND', 404, 'restaurantNotConfigured', 'No restaurant is configured.');
  return row.id;
}
