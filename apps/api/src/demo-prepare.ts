import { assertDemoDatabase } from './demo-guard.js';
import { db } from './db.js';
import { audit } from './audit.js';
assertDemoDatabase();
const admin = await db.user.findUnique({ where: { email: 'admin@demo.example.test' } });
const facility = await db.facility.findFirst({ where: { demo: true }, orderBy: { slug: 'asc' } });
if (admin?.role === 'ADMIN' && admin.termsVersion === 'DEMO-FIXTURE-NOT-USER-ACCEPTANCE' && facility) {
  const existing = await db.membership.findUnique({
    where: { userId_facilityId: { userId: admin.id, facilityId: facility.id } },
  });
  if (!existing)
    await db.$transaction(async (tx) => {
      await tx.membership.create({
        data: {
          userId: admin.id,
          facilityId: facility.id,
          role: 'OWNER',
          permissions: ['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'],
        },
      });
      await audit(
        tx,
        null,
        'LOCAL_DEMO_HOST_ASSIGNMENT',
        admin.id,
        'SUCCESS',
        undefined,
        'Assign fictional demo admin to the shared fictional demonstration facility.',
      );
    });
}
// Add a small, explicit fictional scenario once; never overwrite decisions made while testing.
const player = await db.user.findUnique({ where: { email: 'player@demo.example.test' } });
const court =
  facility &&
  (await db.court.findFirst({ where: { facilityId: facility.id, active: true }, orderBy: { name: 'asc' } }));
if (player?.termsVersion === 'DEMO-FIXTURE-NOT-USER-ACCEPTANCE' && court && facility && admin) {
  const date = new Date(Date.now() + 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  for (const [reference, hour, status] of [
    ['DEMO-CALENDAR-CONFIRMED', '09', 'CONFIRMED'],
    ['DEMO-CALENDAR-PENDING', '11', 'PENDING'],
  ] as const) {
    if (await db.booking.findUnique({ where: { reference } })) continue;
    const startsAt = new Date(`${date}T${hour}:00:00+08:00`),
      endsAt = new Date(startsAt.getTime() + 3600000);
    if (
      await db.allocation.findFirst({
        where: { courtId: court.id, active: true, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      })
    )
      continue;
    await db.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          reference,
          userId: player.id,
          courtId: court.id,
          startsAt,
          endsAt,
          status,
          mode: 'PRIVATE',
          expectedGuests: 1,
          totalCentavos: court.hourlyRate,
          hourlyRateSnapshot: court.hourlyRate,
          policySnapshot: facility.cancellationPolicy,
          expiresAt: new Date(Math.min(Date.now() + 86400000, startsAt.getTime())),
          history: {
            create: {
              status,
              actorId: admin.id,
              reason: 'Fictional demonstration scenario. No payment was collected.',
            },
          },
          ...(status === 'CONFIRMED'
            ? { allocation: { create: { courtId: court.id, startsAt, endsAt, kind: 'BOOKING' } } }
            : {}),
        },
      });
      await audit(tx, null, 'LOCAL_DEMO_BOOKING_SCENARIO', booking.id);
    });
  }
}
await db.$disconnect();
