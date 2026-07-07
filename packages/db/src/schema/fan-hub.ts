import { pgTable, serial, integer, text, numeric, timestamp, boolean } from "drizzle-orm/pg-core";

export const fanProfilesTable = pgTable("fan_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  phone: text("phone"),
  state: text("state"),
  instagramHandle: text("instagram_handle"),
  twitterHandle: text("twitter_handle"),
  tiktokHandle: text("tiktok_handle"),
  referralCode: text("referral_code").notNull().unique(),
  referredByCode: text("referred_by_code"),
  fanTier: integer("fan_tier").notNull().default(1),
  totalPoints: integer("total_points").notNull().default(0),
  referralCount: integer("referral_count").notNull().default(0),
  purchaseVerified: boolean("purchase_verified").notNull().default(false),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fanTierHistoryTable = pgTable("fan_tier_history", {
  id: serial("id").primaryKey(),
  fanProfileId: integer("fan_profile_id").notNull(),
  userId: integer("user_id").notNull(),
  fromTier: integer("from_tier").notNull(),
  toTier: integer("to_tier").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fanPointsLedgerTable = pgTable("fan_points_ledger", {
  id: serial("id").primaryKey(),
  fanProfileId: integer("fan_profile_id").notNull(),
  userId: integer("user_id").notNull(),
  action: text("action").notNull(),
  points: integer("points").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fanChallengesTable = pgTable("fan_challenges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  pointValue: integer("point_value").notNull().default(50),
  deadline: timestamp("deadline", { withTimezone: true }),
  proofType: text("proof_type").notNull().default("text"),
  status: text("status").notNull().default("active"),
  participantCount: integer("participant_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const challengeSubmissionsTable = pgTable("challenge_submissions", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull(),
  fanProfileId: integer("fan_profile_id").notNull(),
  userId: integer("user_id").notNull(),
  proofText: text("proof_text"),
  proofUrl: text("proof_url"),
  status: text("status").notNull().default("pending"),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contentVaultItemsTable = pgTable("content_vault_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  contentType: text("content_type").notNull().default("chapter"),
  accessTier: integer("access_tier").notNull().default(1),
  contentUrl: text("content_url"),
  thumbnailUrl: text("thumbnail_url"),
  fileSize: text("file_size"),
  downloadCount: integer("download_count").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const merchDiscountCodesTable = pgTable("merch_discount_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  fanProfileId: integer("fan_profile_id").notNull(),
  code: text("code").notNull().unique(),
  discountPercent: integer("discount_percent").notNull().default(15),
  used: boolean("used").notNull().default(false),
  usedAt: timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ogInviteListTable = pgTable("og_invite_list", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  fanProfileId: integer("fan_profile_id").notNull(),
  status: text("status").notNull().default("waitlist"),
  inviteLink: text("invite_link"),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
