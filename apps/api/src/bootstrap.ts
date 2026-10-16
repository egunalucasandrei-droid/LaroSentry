import { assertDemoDatabase } from './demo-guard.js';
assertDemoDatabase();
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from './db.js';
import { passwordHash } from './auth.controller.js';
import { audit } from './audit.js';
const role = process.argv[2] ?? 'PLAYER';
if (!['PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF'].includes(role))
  throw new Error(
    'Use PLAYER, FACILITY_OWNER, or FACILITY_STAFF. Admin access requires the explicit admin:access command for an existing verified account.',
  );
const email = process.argv[3];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error('Usage: pnpm demo:account ROLE email. New account only.');
const password = randomBytes(24).toString('base64url');
const user = await db.user.create({
  data: {
    email: email.toLowerCase(),
    nickname: `Demo ${role.toLowerCase().replaceAll('_', ' ')}`,
    passwordHash: await passwordHash(password),
    verifiedAt: new Date(),
    ...(process.env.NODE_ENV === 'test' ? { phoneVerifiedAt: new Date() } : {}),
    role,
  },
});
if (['FACILITY_OWNER', 'FACILITY_STAFF'].includes(role)) {
  const facility = await db.facility.findFirst({ where: { demo: true }, orderBy: { slug: 'asc' } });
  if (!facility) throw new Error('Seed demo facilities first.');
  await db.membership.create({
    data: {
      userId: user.id,
      facilityId: facility.id,
      role: role === 'FACILITY_OWNER' ? 'OWNER' : 'STAFF',
      permissions: ['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'],
    },
  });
}
await audit(db, user.id, 'LOCAL_DEMO_BOOTSTRAP', user.id);
const directory = resolve('../../.local');
mkdirSync(directory, { recursive: true });
const output = resolve(directory, `demo-${user.id}.txt`);
writeFileSync(
  output,
  `Local demonstration account\nEmail: ${email}\nPassword: ${password}\nRole: ${role}\nMFA must be enrolled in the website before privileged access.\n`,
  { mode: 0o600 },
);
console.log(
  `New demo account created. Credentials are in the ignored local file ${output}. They are not printed or committed.`,
);
await db.$disconnect();
