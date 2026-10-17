import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { Tx } from './db.js';
import type { AuthRequest } from './http.js';
import { audit } from './audit.js';
import { demoModeFor, demoSessionVerified } from './demo-access.js';

export async function lockAdminAccess(tx: Tx) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('larosentry-admin-access',0))::text`;
}
// Revalidate inside the transaction after the common access lock. A concurrent
// restriction or local role change must not leave a stale administrator able to write.
export async function adminWriter(tx: Tx, req: AuthRequest) {
  await lockAdminAccess(tx);
  const session =
    req.session && (await tx.session.findUnique({ where: { id: req.session.id }, include: { user: true } }));
  if (
    !session ||
    session.user.role !== 'ADMIN' ||
    session.user.suspendedAt ||
    (!session.user.verifiedAt && !demoModeFor(session.user)) ||
    (!session.user.phoneVerifiedAt && !demoSessionVerified(session, session.user)) ||
    ((!session.user.mfaEnabled || !session.mfaVerified) && !demoSessionVerified(session, session.user)) ||
    session.expiresAt <= new Date() ||
    session.lastSeenAt.getTime() <= Date.now() - 1800000
  )
    throw new ForbiddenException('An active administrator account and verified MFA session are required.');
  return session.user;
}
export async function preserveAdminAccess(tx: Tx, targetId: string) {
  const target = await tx.user.findUniqueOrThrow({ where: { id: targetId } });
  if (target.role === 'ADMIN' && !target.suspendedAt) {
    const others = await tx.user.count({
      where: {
        id: { not: targetId },
        role: 'ADMIN',
        suspendedAt: null,
        verifiedAt: { not: null },
        phoneVerifiedAt: { not: null },
        mfaEnabled: true,
      },
    });
    if (!others)
      throw new ConflictException(
        'Keep at least one other unrestricted, verified administrator with enrolled MFA before removing this access.',
      );
  }
}
export async function decision(
  tx: Tx,
  actorId: string,
  targetType: string,
  targetId: string,
  action: string,
  reason: string,
  correlationId: string,
  previousState?: string,
  newState?: string,
) {
  await tx.adminDecision.create({
    data: { actorId, targetType, targetId, action, reason, previousState, newState },
  });
  await audit(tx, actorId, action, targetId, 'SUCCESS', correlationId, reason);
}
