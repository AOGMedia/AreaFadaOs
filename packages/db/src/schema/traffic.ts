import { pgTable, serial, integer, text, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";

export const trafficCampaignsTable = pgTable("traffic_campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  destinationUrl: text("destination_url").notNull(),
  budgetNgn: numeric("budget_ngn", { precision: 12, scale: 2 }).notNull().default("0"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  status: text("status").notNull().default("draft"), // draft | active | paused | completed
  goal: text("goal").notNull().default("visits"), // visits | leads | sales | downloads
  targetRegion: text("target_region").notNull().default("NG"),
  totalVisits: integer("total_visits").notNull().default(0),
  totalConversions: integer("total_conversions").notNull().default(0),
  roiPercent: numeric("roi_percent", { precision: 8, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const campaignChannelConfigsTable = pgTable("campaign_channel_configs", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  userId: integer("user_id").notNull(),
  channel: text("channel").notNull(), // organic_social | whatsapp | meta_ads | influencer | tiktok_spark | email
  enabled: boolean("enabled").notNull().default(false),
  budgetAllocationNgn: numeric("budget_allocation_ngn", { precision: 12, scale: 2 }).notNull().default("0"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  visits: integer("visits").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  costPerVisit: numeric("cost_per_visit", { precision: 8, scale: 2 }),
  status: text("status").notNull().default("idle"), // idle | active | paused | completed
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const trafficEventsTable = pgTable("traffic_events", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  userId: integer("user_id").notNull(),
  channel: text("channel").notNull(),
  eventType: text("event_type").notNull().default("click"), // click | visit | lead | conversion
  trackedLinkSlug: text("tracked_link_slug"),
  referrer: text("referrer"),
  region: text("region"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
});

export const growthSnapshotsTable = pgTable("growth_snapshots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  platformAccountId: integer("platform_account_id").notNull(),
  platform: text("platform").notNull(),
  handle: text("handle").notNull(),
  followerCount: integer("follower_count").notNull().default(0),
  followerGrowthRate: numeric("follower_growth_rate", { precision: 8, scale: 4 }).notNull().default("0"), // percent per week
  reachCount: integer("reach_count").notNull().default(0),
  reachGrowthRate: numeric("reach_growth_rate", { precision: 8, scale: 4 }).notNull().default("0"),
  engagementVelocity: numeric("engagement_velocity", { precision: 8, scale: 4 }).notNull().default("0"), // avg engagements/day
  healthScore: integer("health_score").notNull().default(50), // 0-100
  alertThresholdRate: numeric("alert_threshold_rate", { precision: 8, scale: 4 }).default("0"),
  alertEnabled: boolean("alert_enabled").notNull().default(false),
  snapshotDate: timestamp("snapshot_date", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const hookLibraryEntriesTable = pgTable("hook_library_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"), // null = platform-curated
  title: text("title").notNull(),
  hookText: text("hook_text").notNull(),
  platform: text("platform").notNull(), // instagram | tiktok | twitter | youtube | all
  niche: text("niche").notNull().default("general"), // music | tech | fashion | food | lifestyle | gospel | politics | general
  format: text("format").notNull().default("caption"), // caption | thumbnail | opener | cta
  useCount: integer("use_count").notNull().default(0),
  likeCount: integer("like_count").notNull().default(0),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  curated: boolean("curated").notNull().default(false),
  weekNumber: integer("week_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const seoContentPiecesTable = pgTable("seo_content_pieces", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  topic: text("topic").notNull(),
  contentType: text("content_type").notNull().default("blog"), // blog | youtube_description | thread
  targetKeywords: jsonb("target_keywords").$type<string[]>().notNull().default([]),
  region: text("region").notNull().default("NG"),
  title: text("title"),
  body: text("body"),
  metaDescription: text("meta_description"),
  status: text("status").notNull().default("pending"), // pending | generating | done | failed
  publishedToCalendar: boolean("published_to_calendar").notNull().default(false),
  scheduledPostId: integer("scheduled_post_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
