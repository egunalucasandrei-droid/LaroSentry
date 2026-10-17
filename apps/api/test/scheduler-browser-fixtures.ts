import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { db } from '../src/db.js';
import { passwordHash } from '../src/auth.controller.js';
if (
  process.env.NODE_ENV !== 'test' ||
  process.env.SCHEDULER_E2E !== '1' ||
  new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.LOCAL_DEMO_INSTANCE}` ||
  !/^larosentry_demo_\d{13}$/.test(process.env.LOCAL_DEMO_INSTANCE ?? '')
)
  throw new Error('Dedicated scheduler test database required.');
const fixtures: Record<string, { id: string; email: string; password: string }> = {};
for (const role of ['ADMIN', 'FACILITY_OWNER', 'PLAYER', 'FACILITY_STAFF']) {
  const email = `${role.toLowerCase()}@demo.example.test`,
    password = `Test-${randomUUID()}-aA7`;
  const user = await db.user.create({
    data: {
      email,
      passwordHash: await passwordHash(password),
      nickname: `Scheduler ${role}`,
      role,
      verifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
    },
  });
  fixtures[role] = { id: user.id, email, password };
}
await db.facility.create({
  data: {
    name: 'NOLTA Test Club',
    slug: 'nolta-test-club',
    area: 'Fictional',
    address: 'Local test only',
    description: 'Isolated browser scheduler fixture',
    latitude: 14,
    longitude: 121,
    amenities: [],
    demo: true,
    status: 'PUBLISHED',
    cancellationPolicy: 'Cancel before start.',
    courts: {
      create: { name: 'Original court', sport: 'Tennis', surface: 'Hard', hourlyRate: 60000, capacity: 4 },
    },
    memberships: {
      create: ['ADMIN', 'FACILITY_OWNER'].map((role) => ({
        userId: fixtures[role]!.id,
        role: 'OWNER',
        permissions: ['BOOKINGS'],
      })),
    },
  },
});
await db.facility.create({
  data: {
    name: 'Z Different Hours Club',
    slug: 'different-hours-club',
    area: 'Fictional',
    address: 'Local test only',
    description: 'Empty facility to verify inherited hours',
    latitude: 14,
    longitude: 121,
    amenities: [],
    demo: true,
    status: 'PUBLISHED',
    openHour: 8,
    closeHour: 18,
    cancellationPolicy: 'Cancel before start.',
    memberships: {
      create: ['ADMIN', 'FACILITY_OWNER'].map((role) => ({
        userId: fixtures[role]!.id,
        role: 'OWNER',
        permissions: ['BOOKINGS'],
      })),
    },
  },
});
writeFileSync(resolve('../../.local/scheduler-browser-fixtures.json'), JSON.stringify(fixtures), {
  mode: 0o600,
});
console.log('Isolated scheduler fixtures created; shared demo accounts were not modified.');
await db.$disconnect();
