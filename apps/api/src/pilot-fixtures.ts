// Operator-only provisioning of fictional accounts, never called by the web server.
import { readFileSync } from 'node:fs';
import { db } from './db.js';
import { env } from './config.js';
import { passwordHash } from './auth.controller.js';
import { passwordSchema } from '@larosentry/contracts';
import { audit } from './audit.js';
if (
  env.NODE_ENV !== 'production' ||
  env.PUBLIC_PILOT !== '1' ||
  process.env.PILOT_FIXTURES !== '1' ||
  new URL(env.DATABASE_URL).pathname !== '/larosentry_pilot' ||
  !process.env.PILOT_PASSWORD_FILE
)
  throw new Error('Explicit operator provisioning is allowed only on the separate public test database.');
const passwords = JSON.parse(readFileSync(process.env.PILOT_PASSWORD_FILE, 'utf8')) as Record<string, string>;
const roles = ['PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF', 'ADMIN'];
for (const role of roles) passwordSchema.parse(passwords[role]);
const sports = ['Basketball', 'Badminton', 'Tennis', 'Volleyball', 'Futsal', 'Pickleball'];
for (const [i, area] of ['Quezon City', 'Marikina', 'Pasig'].entries()) {
  await db.facility.upsert({
    where: { slug: `pilot-courts-${i + 1}` },
    update: {},
    create: {
      slug: `pilot-courts-${i + 1}`,
      name: `Fictional Test Courts ${i + 1}`,
      area,
      address: `Fictional test address, ${area}`,
      demo: true,
      status: 'PUBLISHED',
      description: 'Fictional test facility. No real reservations, payments or services are offered.',
      latitude: 14.65 + i * 0.01,
      longitude: 121.05 + i * 0.01,
      openHour: 6,
      closeHour: 22,
      amenities: ['Covered courts', 'Restrooms'],
      cancellationPolicy: 'Test bookings only. No real payment or refund is processed.',
      courts: {
        create: [0, 1].map((j) => ({
          name: `Test Court ${j + 1}`,
          sport: sports[i * 2 + j]!,
          hourlyRate: 30000,
          capacity: 12,
        })),
      },
    },
  });
}
const facility = await db.facility.findUniqueOrThrow({ where: { slug: 'pilot-courts-1' } });
for (const role of roles) {
  const email = `${role.toLowerCase()}@pilot.example.test`;
  if (await db.user.findUnique({ where: { email } })) continue;
  const user = await db.user.create({
    data: {
      email,
      nickname: `Fictional ${role.toLowerCase()}`,
      role,
      passwordHash: await passwordHash(passwords[role]!),
      // Synthetic contact state for labelled fixtures, not proof of real email/SMS delivery.
      verifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      contactRequired: false,
      onboardingCompletedAt: new Date(),
      purpose: 'PLAYER',
      termsVersion: 'PILOT-FIXTURE-NOT-USER-ACCEPTANCE',
    },
  });
  if (role !== 'PLAYER')
    await db.membership.create({
      data: {
        userId: user.id,
        facilityId: facility.id,
        role: role === 'FACILITY_STAFF' ? 'STAFF' : 'OWNER',
        permissions: ['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'],
      },
    });
  await audit(db, null, 'PUBLIC_PILOT_SYNTHETIC_FIXTURE_CREATED', user.id);
}
console.log(
  'Fictional pilot facilities and accounts provisioned. Passwords are not printed; MFA remains required.',
);
await db.$disconnect();
