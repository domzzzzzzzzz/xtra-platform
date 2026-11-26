/** Creates the XTRA super admin and a demo venue with a floor map, slots and menu. */
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pool, runMigrations, schema } from './db/index.js';
import { config } from './config.js';

await runMigrations();
const email = config.superAdmin.email.toLowerCase();
let [admin] = await db.select().from(schema.users).where(eq(schema.users.email, email));
if (!admin) {
  [admin] = await db.insert(schema.users).values({ email, name: 'XTRA Admin', isSuperAdmin: true, passwordHash: await bcrypt.hash(config.superAdmin.password, 10) }).returning();
  console.log(`Super admin: ${email}`);
}
await db.insert(schema.platformSettings).values({ id: 1 }).onConflictDoNothing();

const [exists] = await db.select().from(schema.venues).where(eq(schema.venues.slug, 'lumen-rooftop'));
if (!exists) {
  const [v] = await db.insert(schema.venues).values({ name: 'Lumen Rooftop', slug: 'lumen-rooftop', depositPerPerson: 50000, instagram: 'lumenrooftop', address: 'New Cairo' }).returning();
  await db.insert(schema.venueStaff).values({ venueId: v.id, userId: admin.id, role: 'owner' });
  // Laid out on the editor's 1000 × 620 canvas.
  const [terrace] = await db.insert(schema.floorItems).values({ venueId: v.id, kind: 'zone', label: 'Terrace', x: 30, y: 110, w: 560, h: 490, minSpend: 600000, sort: 0 }).returning();
  const [vip] = await db.insert(schema.floorItems).values({ venueId: v.id, kind: 'zone', label: 'VIP', x: 610, y: 110, w: 360, h: 490, minSpend: 1500000, deposit: 200000, sort: 1 }).returning();
  await db.insert(schema.floorItems).values([
    { venueId: v.id, kind: 'bar', label: 'Bar', x: 30, y: 20, w: 560, h: 70, sort: 2 },
    { venueId: v.id, kind: 'dj', label: 'DJ', x: 610, y: 20, w: 360, h: 70, sort: 3 },
    { venueId: v.id, kind: 'entrance', label: 'Entrance', x: 30, y: 606, w: 140, h: 10, sort: 4 },
    ...[[140, 240], [310, 240], [480, 240], [140, 460], [310, 460], [480, 460]].map(([x, y], i) => (
      { venueId: v.id, kind: 'table' as const, shape: 'round', label: `T${i + 1}`, x, y, w: 1, h: 1, seats: 4, zoneId: terrace.id, sort: 5 + i })),
    ...[[700, 240, 8], [880, 240, 8], [790, 470, 10]].map(([x, y, seats], i) => (
      { venueId: v.id, kind: 'sofa' as const, shape: 'sofa', label: `V${i + 1}`, x, y, w: 1, h: 1, seats, zoneId: vip.id, sort: 11 + i })),
  ]);
  // Same grid as Venue setup's defaults: 9 PM to 12:30 AM, every 30 minutes, 4 bookings each.
  await db.insert(schema.timeSlots).values(Array.from({ length: 8 }, (_, i) => {
    const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const m = 21 * 60 + i * 30;
    return { venueId: v.id, startsAt: hm(m), endsAt: hm(m + 30), capacity: 0, maxBookings: 4 };
  }));
  await db.insert(schema.menuItems).values([
    { venueId: v.id, category: 'Drinks', name: 'Mojito', price: 32000 },
    { venueId: v.id, category: 'Drinks', name: 'Espresso', price: 9000 },
    { venueId: v.id, category: 'Food', name: 'Truffle fries', price: 21000 },
  ]);
  await db.insert(schema.communityTiers).values([
    { venueId: v.id, name: 'Member', minSpend: 0, perks: ['Birthday welcome drink'], sort: 0 },
    { venueId: v.id, name: 'Silver', minSpend: 5_000_000, perks: ['Priority booking'], sort: 1 },
    { venueId: v.id, name: 'Gold', minSpend: 15_000_000, perks: ['Guaranteed table', 'Free entry +1'], sort: 2 },
  ]);
  console.log('Demo venue: lumen-rooftop');
}
await pool.end();
