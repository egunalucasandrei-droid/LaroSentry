import { randomUUID } from 'node:crypto';
import type { Tx } from './db.js';
export function audit(
  tx: Tx,
  actorId: string | null,
  action: string,
  resourceId?: string,
  outcome = 'SUCCESS',
  correlationId: string = randomUUID(),
  reason?: string,
) {
  return tx.auditEvent.create({ data: { actorId, action, resourceId, outcome, correlationId, reason } });
}
