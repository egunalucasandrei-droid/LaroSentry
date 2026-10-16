import { assertDemoDatabase } from './demo-guard.js';
assertDemoDatabase();
import { db } from './db.js';
const names = [
  'Diliman Fieldhouse',
  'Commonwealth Courts',
  'Katipunan Sports Yard',
  'Maginhawa Play Park',
  'Fairview Athletic Club',
  'Cubao Court Collective',
  'Novaliches Game Space',
  'Project 6 Sports Hall',
  'UP Village Courts',
  'Tandang Sora Arena',
  'Marikina Riverside Courts',
  'Pasig Playhouse',
  'Mandaluyong Sports Loft',
  'San Juan Court Garden',
  'Makati Rally House',
  'Taguig Active Park',
  'Valenzuela Field Club',
  'Caloocan Community Courts',
  'Pasay Game Hall',
  'Manila Court Studio',
];
const areas = [
  'Quezon City',
  'Quezon City',
  'Quezon City',
  'Quezon City',
  'Quezon City',
  'Quezon City',
  'Quezon City',
  'Quezon City',
  'Quezon City',
  'Quezon City',
  'Marikina',
  'Pasig',
  'Mandaluyong',
  'San Juan',
  'Makati',
  'Taguig',
  'Valenzuela',
  'Caloocan',
  'Pasay',
  'Manila',
];
const sports = ['Basketball', 'Badminton', 'Tennis', 'Volleyball', 'Futsal', 'Pickleball'];
for (const [index, name] of names.entries()) {
  const slug = name.toLowerCase().replaceAll(' ', '-');
  await db.facility.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      name,
      area: areas[index]!,
      address: `${20 + index} Demo Avenue, ${areas[index]}, Metro Manila (fictional address)`,
      description:
        'A welcoming space to get your game going. This fictional demonstration facility illustrates court discovery and staff-approved reservations in LaroSentry. It is not a real business.',
      latitude: 14.65 + (index % 5) * 0.009,
      longitude: 121.03 + Math.floor(index / 5) * 0.012,
      amenities:
        index % 2
          ? ['Parking', 'Restrooms', 'Drinking water']
          : ['Covered courts', 'Parking', 'Restrooms', 'Changing rooms'],
      demo: true,
      status: 'PUBLISHED',
      openHour: 6,
      closeHour: 22,
      cancellationPolicy:
        'Cancel before the scheduled start. External payments require direct facility review; cancelling does not issue a refund. Demo policy only.',
      courts: {
        create: [0, 1].map((i) => ({
          name: `Court ${i + 1}`,
          sport: sports[(index + i) % sports.length]!,
          hourlyRate: (300 + (index % 6) * 150 + i * 100) * 100,
          capacity: (index + i) % 6 === 1 ? 6 : 20,
        })),
      },
    },
  });
}
console.log(
  '20 fictional facilities seeded. Existing records preserved. No accounts or bookings created automatically.',
);
await db.$disconnect();
