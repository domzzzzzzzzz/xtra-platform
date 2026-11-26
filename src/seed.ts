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
  const [terrace] = await db.insert(schema.floorItems).values({ venueId: v.id, kind: 'zone', label: 'Terrace', x: 0, y: 0, w: 600, h: 400, minSpend: 600000 }).returning();
  const [vip] = await db.insert(schema.floorItems).values({ venueId: v.id, kind: 'zone', label: 'VIP', x: 600, y: 0, w: 400, h: 400, minSpend: 1500000 }).returning();
  for (let i = 1; i <= 6; i++) {
    await db.insert(schema.floorItems).values({ venueId: v.id, kind: 'table', shape: 'round', label: `T${i}`, x: 40 + (i - 1) * 90, y: 80, w: 70, h: 70, seats: 4, zoneId: terrace.id });
  }
  await db.insert(schema.floorItems).values({ venueId: v.id, kind: 'sofa', shape: 'u-sofa', label: 'V1', x: 650, y: 80, w: 140, h: 100, seats: 8, zoneId: vip.id });
  await db.insert(schema.timeSlots).values([
    { venueId: v.id, startsAt: '20:00', endsAt: '22:00', capacity: 60 },
    { venueId: v.id, startsAt: '22:00', endsAt: '02:00', capacity: 120 },
  ]);
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
