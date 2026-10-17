import { db } from './db.js';
import { assertDemoDatabase } from './demo-guard.js';
import { env } from './config.js';
import { quote } from './bookings.controller.js';
import { audit } from './audit.js';
import { collectSecurityAlerts } from './security-alerts.js';
import { phtDate } from '@larosentry/contracts';

export async function preparePresentationScenarios() {
  assertDemoDatabase();
  if (process.env.RENDER === 'true' || env.PUBLIC_PILOT === '1')
    throw new Error('Presentation fixtures are local only.');
  const date = phtDate(new Date());
  const result = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('local-presentation-fixtures',0))::text`;
      if (
        await tx.auditEvent.findFirst({
          where: { action: 'PRESENTATION_SCENARIOS_PREPARED', resourceId: date },
        })
      )
        return {
          reused: true,
          bookings: 0,
          checkInReady: !!(await tx.booking.findFirst({
            where: { reference: `PRESENT-${date}-CHECK-IN`, status: 'CONFIRMED', endsAt: { gt: new Date() } },
          })),
        };
      const users = await tx.user.findMany({
        where: {
          email: {
            in: [
              'player@demo.example.test',
              'facility_owner@demo.example.test',
              'facility_staff@demo.example.test',
              'admin@demo.example.test',
            ],
          },
        },
      });
      const player = users.find((u) => u.role === 'PLAYER')!,
        owner = users.find((u) => u.role === 'FACILITY_OWNER')!,
        staff = users.find((u) => u.role === 'FACILITY_STAFF')!,
        admin = users.find((u) => u.role === 'ADMIN')!;
      if (!player || !owner || !staff || !admin)
        throw new Error('Create the existing four named local demo accounts first.');
      const facility = await tx.facility.findFirstOrThrow({
        where: {
          demo: true,
          status: 'PUBLISHED',
          memberships: { some: { userId: owner.id, role: 'OWNER' } },
        },
        include: { courts: { where: { active: true }, orderBy: { name: 'asc' } }, memberships: true },
        orderBy: { slug: 'asc' },
      });
      if (!facility.memberships.some((m) => m.userId === staff.id && m.role === 'STAFF'))
        throw new Error('Staff must already be assigned to the demonstration facility.');
      const template = facility.courts[0];
      if (!template) throw new Error('No active presentation court.');
      const court =
        (await tx.court.findFirst({
          where: { facilityId: facility.id, name: 'Fictional Presentation Court' },
        })) ??
        (await tx.court.create({
          data: {
            facilityId: facility.id,
            name: 'Fictional Presentation Court',
            sport: 'Badminton',
            hourlyRate: template.hourlyRate,
            capacity: 8,
          },
        }));
      const future = (days: number, hour: number) => {
        const day = phtDate(new Date(Date.now() + days * 86400000));
        return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+08:00`);
      };
      let bookings = 0,
        checkInReady = false;
      for (const spec of [
        {
          suffix: 'REQUEST',
          start: future(1, 9),
          status: 'PENDING',
          mode: 'BOOKING_ONLY',
          userId: player.id,
        },
        {
          suffix: 'PUBLIC-GAME',
          start: future(3, 15),
          status: 'CONFIRMED',
          mode: 'PUBLIC',
          userId: owner.id,
        },
        {
          suffix: 'PAID-BOOKING',
          start: future(2, 11),
          status: 'CONFIRMED',
          mode: 'BOOKING_ONLY',
          userId: player.id,
        },
        {
          suffix: 'CHECK-IN',
          start: new Date(Math.ceil(Date.now() / 1800000) * 1800000),
          status: 'CONFIRMED',
          mode: 'BOOKING_ONLY',
          userId: player.id,
        },
      ]) {
        const duration = spec.suffix === 'CHECK-IN' ? 30 : 60;
        const end = new Date(spec.start.getTime() + duration * 60000);
        let price;
        try {
          price = await quote(tx, {
            courtId: court.id,
            startsAt: spec.start.toISOString(),
            endsAt: end.toISOString(),
            mode: spec.mode as 'BOOKING_ONLY' | 'PUBLIC',
            expectedGuests: Math.min(4, court.capacity),
          });
        } catch {
          if (spec.suffix === 'CHECK-IN') continue;
          throw new Error(
            `Presentation ${spec.suffix} time conflicts with existing data or operating rules. Nothing was reset; choose a fresh demo database.`,
          );
        }
        const booking = await tx.booking.create({
          data: {
            reference: `PRESENT-${date}-${spec.suffix}`,
            userId: spec.userId,
            courtId: court.id,
            startsAt: spec.start,
            endsAt: end,
            status: spec.status,
            mode: spec.mode,
            expectedGuests: Math.min(4, court.capacity),
            totalCentavos: price.totalCentavos,
            hourlyRateSnapshot: price.hourlyRate,
            policySnapshot: price.policy,
            expiresAt: spec.start,
            source: 'PRESENTATION',
            published: spec.mode === 'PUBLIC',
            rules:
              spec.mode === 'PUBLIC'
                ? 'Fictional presentation game. Friendly play; organizer approves every participant. No real payment is collected.'
                : '',
            history: {
              create: {
                status: spec.status,
                actorId: spec.status === 'PENDING' ? player.id : owner.id,
                reason: 'Clearly fictional local presentation fixture, not a real customer transaction.',
              },
            },
          },
        });
        if (spec.status === 'CONFIRMED')
          await tx.allocation.create({
            data: {
              bookingId: booking.id,
              courtId: court.id,
              startsAt: spec.start,
              endsAt: end,
              kind: 'BOOKING',
              reason: 'Fictional presentation reservation',
            },
          });
        if (['PAID-BOOKING', 'CHECK-IN'].includes(spec.suffix))
          await tx.paymentRecord.create({
            data: {
              bookingId: booking.id,
              amountCentavos: price.totalCentavos,
              method: 'CASH',
              reference: `FICTIONAL-${date}-${spec.suffix}`,
              state: 'PAID',
              actorId: owner.id,
            },
          });
        await tx.notification.create({
          data: {
            userId: player.id,
            title: `Presentation scenario: ${spec.suffix.toLowerCase().replaceAll('-', ' ')}`,
            href: spec.mode === 'PUBLIC' ? `/app/games/${booking.id}` : `/app/bookings/${booking.id}`,
          },
        });
        bookings++;
        if (spec.suffix === 'CHECK-IN') checkInReady = true;
      }
      await tx.savedFacility.upsert({
        where: { userId_facilityId: { userId: player.id, facilityId: facility.id } },
        create: { userId: player.id, facilityId: facility.id },
        update: {},
      });
      await tx.userReport.create({
        data: {
          reporterId: player.id,
          targetType: 'GENERAL',
          category: 'Other',
          details:
            'FICTIONAL PRESENTATION: Please review whether the demo facility cancellation information is clear. No real person is accused.',
        },
      });
      const applicationFacility = await tx.facility.create({
        data: {
          name: `Fictional Presentation Sports Hall ${date}`,
          slug: `presentation-hall-${date}`,
          area: 'Quezon City',
          address: 'Fictional presentation address only',
          description: 'Synthetic local application for a client walkthrough. Not a real venue.',
          latitude: 14.65,
          longitude: 121.05,
          amenities: ['Covered courts'],
          demo: true,
          status: 'PENDING',
          cancellationPolicy: 'Fictional local presentation policy only.',
          courts: {
            create: { name: 'Demo badminton court', sport: 'Badminton', hourlyRate: 50000, capacity: 4 },
          },
        },
      });
      await tx.facilityApplication.create({
        data: {
          facilityId: applicationFacility.id,
          applicantId: player.id,
          applicantMessage:
            'FICTIONAL DEMO: synthetic legacy application; no government identity material. Independent admin must review.',
          identityState: 'DEMO_BYPASSED',
        },
      });
      // Explicit synthetic evidence, not fabricated attack attribution. Existing rule processing derives the review alert.
      for (let i = 0; i < 3; i++)
        await audit(
          tx,
          player.id,
          'ADMIN_ACCESS_DENIED',
          facility.id,
          'DENIED',
          undefined,
          'SYNTHETIC LOCAL PRESENTATION EXERCISE: illustrates denied admin access; no wrongdoing established.',
        );
      await audit(
        tx,
        admin.id,
        'PRESENTATION_SCENARIOS_PREPARED',
        date,
        'SUCCESS',
        undefined,
        'Fictional local-only fixtures. Existing records and credentials preserved.',
      );
      return { reused: false, bookings, checkInReady };
    },
    { timeout: 30000 },
  );
  await collectSecurityAlerts();
  return result;
}
