import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { usersTable, activityLogTable } from "./schema";
import { eq } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const DEMO_USERS = [
  {
    clerkId: "demo_free_user",
    email: "demo-free@areafadaos.app",
    displayName: "Demo Free User",
    tier: "free" as const,
    country: "Nigeria",
  },
  {
    clerkId: "demo_creator_user",
    email: "demo-creator@areafadaos.app",
    displayName: "Chidi Creator",
    tier: "creator" as const,
    bio: "Nigerian music producer and content creator",
    country: "Nigeria",
  },
  {
    clerkId: "demo_brand_user",
    email: "demo-brand@areafadaos.app",
    displayName: "BrandX Nigeria",
    tier: "brand" as const,
    bio: "Leading FMCG brand in West Africa",
    country: "Nigeria",
  },
  {
    clerkId: "demo_agency_user",
    email: "demo-agency@areafadaos.app",
    displayName: "Naija Digital Agency",
    tier: "agency" as const,
    bio: "Full-service social media agency serving 36 states",
    country: "Nigeria",
  },
  {
    clerkId: "demo_enterprise_user",
    email: "demo-enterprise@areafadaos.app",
    displayName: "Area Fada Enterprises",
    tier: "enterprise" as const,
    bio: "Charly Boy's enterprise brand suite",
    country: "Nigeria",
  },
];

const DEMO_ACTIVITIES = [
  { type: "post_scheduled", description: "Scheduled Instagram post for '999' book launch campaign" },
  { type: "brand_deal", description: "New brand deal inquiry from Paystack Nigeria" },
  { type: "ambassador", description: "Lagos state ambassador Tunde completed 3 tasks" },
  { type: "revenue", description: "Invoice #INV-0047 paid — NGN 250,000 by BrandX" },
  { type: "fan_hub", description: "15 new Area Fada Fans verified their '999' purchase" },
  { type: "ai_caption", description: "Generated 12 Pidgin captions for TikTok campaign" },
  { type: "live_session", description: "Charly Boy live Q&A scheduled — 2,100 reminder opt-ins" },
  { type: "promo_link", description: "999/ig link hit 1,000 clicks — 234 download conversions" },
];

async function seed() {
  console.log("🌱 Seeding demo users...");

  for (const user of DEMO_USERS) {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.clerkId, user.clerkId))
      .limit(1);

    let userId: number;

    if (existing.length) {
      userId = existing[0].id;
      await db
        .update(usersTable)
        .set({ tier: user.tier, displayName: user.displayName })
        .where(eq(usersTable.clerkId, user.clerkId));
      console.log(`  ✓ Updated existing user: ${user.displayName} (${user.tier})`);
    } else {
      const [created] = await db.insert(usersTable).values(user).returning({ id: usersTable.id });
      userId = created.id;
      console.log(`  ✓ Created user: ${user.displayName} (${user.tier})`);
    }

    const activityCount = await db
      .select({ id: activityLogTable.id })
      .from(activityLogTable)
      .where(eq(activityLogTable.userId, userId))
      .limit(1);

    if (!activityCount.length) {
      await db.insert(activityLogTable).values(
        DEMO_ACTIVITIES.map((a) => ({ userId, type: a.type, description: a.description })),
      );
      console.log(`  ✓ Seeded ${DEMO_ACTIVITIES.length} activity items for ${user.displayName}`);
    }
  }

  console.log("✅ Seed complete");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
