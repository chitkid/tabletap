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
