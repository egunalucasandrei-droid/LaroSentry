import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { env } from './config.js';
import { audit } from './audit.js';
import { lockAdminAccess, preserveAdminAccess } from './admin-access.js';
import { z } from 'zod';
const [action, rawEmail, reason, confirm] = process.argv.slice(2);
const email = z.email().parse(rawEmail).trim().toLowerCase();
if (
  !['grant', 'revoke'].includes(action ?? '') ||
  !reason ||
  reason.trim().length < 10 ||
  reason.length > 1000 ||
  confirm !== '--confirm'
)
  throw new Error(
    'Usage: pnpm admin:access grant|revoke exact-email "Reason of at least 10 characters" --confirm',
  );
if (
  env.NODE_ENV === 'production' ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(env.DATABASE_URL).hostname)
)
  throw new Error('This bootstrap command is restricted to a local development database.');
try {
  await db.$transaction(async (tx) => {
    await lockAdminAccess(tx);
    const user = await tx.user.findUnique({ where: { email } });
    if (!user || !user.verifiedAt || !user.phoneVerifiedAt || user.suspendedAt)
      throw new Error('Specify an existing, verified, unrestricted account. Register and verify it first.');
    if ((action === 'grant') === (user.role === 'ADMIN'))
      throw new Error('This account already has the requested access state.');
    if (action === 'revoke') await preserveAdminAccess(tx, user.id);
    await tx.user.update({ where: { id: user.id }, data: { role: action === 'grant' ? 'ADMIN' : 'PLAYER' } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await audit(
      tx,
      null,
      action === 'grant' ? 'LOCAL_ADMIN_GRANTED' : 'LOCAL_ADMIN_REVOKED',
      user.id,
      'SUCCESS',
      randomUUID(),
      reason.trim(),
    );
  });
  console.log(
    'Explicit local admin access change recorded; prior sessions revoked. Sign in again and enroll/verify MFA. No credentials were created or printed.',
  );
} finally {
  await db.$disconnect();
}
