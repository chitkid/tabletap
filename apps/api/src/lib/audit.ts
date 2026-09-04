import { schema, type Db } from '@tabletap/db';

export interface AuditEntry {
  actorType: 'user' | 'guest' | 'system';
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}

export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(schema.auditLog).values({
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    payload: entry.payload ?? {},
  });
}

/**
 * `{ field: { from, to } }` for every key the caller actually sent - the shape every audited edit
 * in this API writes, and the same one `lib/transitions.ts` records on a status change, so the
 * audit row alone can settle a dispute without a second query against a row that has since changed
 * again (or been deleted). It lives beside `recordAudit` because the payload's shape is part of the
 * audit contract: a second copy of this would drift from the first without anything failing.
 */
export function changedFields(
  before: Record<string, unknown>,
  body: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(body)) changed[key] = { from: before[key], to: body[key] };
  return changed;
}
