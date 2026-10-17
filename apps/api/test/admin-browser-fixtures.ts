import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '../src/db.js';
import { passwordHash } from '../src/auth.controller.js';
import { audit } from '../src/audit.js';
if (
  process.env.NODE_ENV !== 'test' ||
  !new URL(process.env.DATABASE_URL!).pathname.startsWith('/larosentry_test_')
)
  throw new Error('Browser fixture accounts require an isolated test database.');
const fixtures: Record<string, { email: string; password: string; id: string }> = {};
for (const role of ['ADMIN', 'PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF']) {
  const password = `Fixture-${randomUUID()}-aA7`,
    email = `${role.toLowerCase()}-${randomUUID()}@example.test`;
  const user = await db.user.create({
    data: {
      email,
      passwordHash: await passwordHash(password),
      nickname: `Browser ${role}`,
      role,
      verifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
    },
  });
  fixtures[role] = { email, password, id: user.id };
  await audit(db, null, 'ISOLATED_TEST_ACCOUNT', user.id);
}
const hostFacility = await db.facility.create({
  data: {
    name: 'Host browser fixture',
    slug: `host-${randomUUID()}`,
    area: 'Test area',
    address: 'Fictional browser test address',
    description: 'Isolated fixture for host management navigation.',
    latitude: 14.6,
    longitude: 121,
    amenities: [],
    demo: true,
    status: 'PUBLISHED',
    openHour: 6,
    closeHour: 22,
    cancellationPolicy: 'Test policy only.',
    courts: { create: { name: 'Host tennis court', sport: 'Tennis', hourlyRate: 50000, capacity: 4 } },
    memberships: {
      create: {
        userId: fixtures.FACILITY_OWNER!.id,
        role: 'OWNER',
        permissions: ['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'],
      },
    },
  },
  include: { courts: true },
});
await db.facilityApplication.create({
  data: { facilityId: hostFacility.id, applicantId: fixtures.FACILITY_OWNER!.id, state: 'APPROVED' },
});
await db.membership.create({
  data: {
    userId: fixtures.FACILITY_STAFF!.id,
    facilityId: hostFacility.id,
    role: 'STAFF',
    permissions: ['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'],
  },
});
const startsAt = new Date(new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10) + 'T10:00:00+08:00');
await db.membership.create({
  data: { userId: fixtures.ADMIN!.id, facilityId: hostFacility.id, role: 'OWNER', permissions: ['BOOKINGS'] },
});
for (const [index, reference] of ['ADMIN-PENDING-CONFIRM', 'ADMIN-PENDING-REJECT'].entries()) {
  const start = new Date(startsAt.getTime() + (3 + index) * 3600000);
  await db.booking.create({
    data: {
      reference,
      userId: fixtures.PLAYER!.id,
      courtId: hostFacility.courts[0]!.id,
      startsAt: start,
      endsAt: new Date(start.getTime() + 3600000),
      status: 'PENDING',
      mode: 'BOOKING_ONLY',
      expectedGuests: 1,
      totalCentavos: 50000,
      hourlyRateSnapshot: 50000,
      policySnapshot: 'Test policy only.',
      expiresAt: start,
    },
  });
}
for (const paid of [true, false]) {
  const booking = await db.booking.create({
    data: {
      reference: `ROLE-${paid ? 'PAID' : 'UNPAID'}`,
      userId: fixtures.PLAYER!.id,
      courtId: hostFacility.courts[0]!.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3600000),
      status: 'CONFIRMED',
      mode: 'BOOKING_ONLY',
      expectedGuests: 1,
      totalCentavos: 50000,
      hourlyRateSnapshot: 50000,
      policySnapshot: 'Test policy only.',
      expiresAt: startsAt,
      history: {
        create: {
          status: 'CONFIRMED',
          actorId: fixtures.FACILITY_OWNER!.id,
          reason: 'Isolated browser fixture',
        },
      },
    },
  });
  if (paid)
    await db.paymentRecord.create({
      data: {
        bookingId: booking.id,
        amountCentavos: 50000,
        method: 'CASH',
        reference: 'ROLE-RECEIPT',
        state: 'PAID',
        actorId: fixtures.FACILITY_OWNER!.id,
      },
    });
}
await db.booking.create({
  data: {
    reference: 'ROLE-CHECKIN',
    userId: fixtures.PLAYER!.id,
    courtId: hostFacility.courts[0]!.id,
    startsAt: new Date(Date.now() - 5 * 60000),
    endsAt: new Date(Date.now() + 55 * 60000),
    status: 'CONFIRMED',
    mode: 'BOOKING_ONLY',
    expectedGuests: 1,
    totalCentavos: 50000,
    hourlyRateSnapshot: 50000,
    policySnapshot: 'Test policy only.',
    expiresAt: new Date(Date.now() + 3600000),
  },
});
writeFileSync(resolve('../../.local/admin-browser-fixtures.json'), JSON.stringify(fixtures), { mode: 0o600 });
// Legacy pending records verify that older applications remain reviewable after migration.
for (const name of ['Admin browser test sports hall', 'Second admin browser test hall']) {
  const f = await db.facility.create({
    data: {
      name,
      slug: `legacy-${randomUUID()}`,
      area: 'Quezon City',
      address: 'Fictional facility for local browser testing',
      description: 'A fictional local test facility for administrative review.',
      latitude: 14.65,
      longitude: 121.05,
      amenities: [],
      cancellationPolicy: 'Cancel before start; no real payment is involved in this fixture.',
      courts: {
        create: { name: 'Test basketball court', sport: 'Basketball', hourlyRate: 50000, capacity: 10 },
      },
    },
  });
  await db.facilityApplication.create({ data: { facilityId: f.id, applicantId: fixtures.PLAYER!.id } });
}
console.log(
  'Isolated test identities created. Credentials are stored only in ignored local fixture storage.',
);
await db.$disconnect();
