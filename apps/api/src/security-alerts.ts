import { db } from './db.js';
export const alertWorker = {
  lastSuccessAt: null as Date | null,
  lastFailureAt: null as Date | null,
  recentEventLimitReached: false,
};
// Local, explainable rules. These create review items only; they never restrict accounts.
export const alertRules = [
  {
    action: 'LOGIN_FAILED',
    threshold: 5,
    severity: 'MEDIUM',
    description: 'At least five failed sign-ins for the same known account in a five-minute window.',
  },
  {
    action: 'ADMIN_ACCESS_DENIED',
    threshold: 3,
    severity: 'MEDIUM',
    description: 'At least three denied admin requests from the same account in a five-minute window.',
  },
  {
    action: 'AUTH_RATE_LIMIT',
    threshold: 1,
    severity: 'LOW',
    description:
      'The account endpoint IP rate limiter fired. Shared networks can cause this; no individual attribution is inferred.',
  },
] as const;
export async function collectSecurityAlerts(now = new Date()) {
  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('larosentry-alert-worker',0))::text`;
      // Bounded recent scan prioritizes current signals. Health exposes truncation.
      const events = await tx.auditEvent.findMany({
        where: {
          action: { in: alertRules.map((r) => r.action) },
          createdAt: { gte: new Date(now.getTime() - 30 * 60000), lte: now },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
      alertWorker.recentEventLimitReached = events.length === 5000;
      const groups = new Map<string, typeof events>();
      for (const e of events) {
        if (!e.actorId && e.action !== 'AUTH_RATE_LIMIT') continue;
        const key = `${e.action}:${e.actorId ?? 'unattributed'}:${Math.floor(e.createdAt.getTime() / 300000)}`;
        groups.set(key, [...(groups.get(key) ?? []), e]);
      }
      for (const [dedupeKey, group] of groups) {
        const rule = alertRules.find((r) => r.action === group[0]!.action)!;
        if (group.length < rule.threshold) continue;
        await tx.securityAlert.upsert({
          where: { dedupeKey },
          create: {
            dedupeKey,
            rule: rule.action,
            severity: rule.severity,
            actorId: group[0]!.actorId,
            eventIds: group.slice(0, 100).map((e) => e.id),
          },
          update: {},
        });
      }
    });
    alertWorker.lastSuccessAt = new Date();
  } catch (error) {
    alertWorker.lastFailureAt = new Date();
    throw error;
  }
}
