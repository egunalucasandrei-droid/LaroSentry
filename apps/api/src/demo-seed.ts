import { readFileSync } from 'node:fs';
import { assertDemoDatabase } from './demo-guard.js';
import { db } from './db.js';
import { passwordHash } from './auth.controller.js';
import { passwordSchema } from '@larosentry/contracts';
import { audit } from './audit.js';
assertDemoDatabase();
const passwords = JSON.parse(readFileSync(process.env.DEMO_PASSWORD_FILE!, 'utf8')) as Record<string, string>;
const roles = ['PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF', 'ADMIN'];
for (const role of roles) passwordSchema.parse(passwords[role]);
const facility = await db.facility.findFirstOrThrow({ where: { demo: true }, orderBy: { slug: 'asc' } });
for (const role of roles) {
  const user = await db.user.create({
    data: {
      email: `${role.toLowerCase()}@demo.example.test`,
      nickname: `Fictional ${role.toLowerCase()}`,
      passwordHash: await passwordHash(passwords[role]!),
      role,
      verifiedAt: new Date(),
      termsVersion: 'DEMO-FIXTURE-NOT-USER-ACCEPTANCE',
    },
  });
  if (role === 'FACILITY_OWNER' || role === 'FACILITY_STAFF' || role === 'ADMIN')
    await db.membership.create({
      data: {
        userId: user.id,
        facilityId: facility.id,
        role: role === 'FACILITY_STAFF' ? 'STAFF' : 'OWNER',
        permissions: ['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'],
      },
    });
  await audit(db, null, 'LOCAL_DEMO_FIXTURE_CREATED', user.id);
}
console.log(
  `Four fictional accounts created. Admin, owner and staff are assigned to ${facility.name}. Use local demo password confirmation or enroll MFA.`,
);
await db.$disconnect();
