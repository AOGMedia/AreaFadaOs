import { pgTable, serial, integer, text, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";

// ─── Campaign Intelligence Configs ───────────────────────────────────────────
export const campaignIntelligenceConfigsTable = pgTable("campaign_intelligence_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  mode: text("mode").notNull().default("general"), // general | political | awards | brand
  politicalParty: text("political_party"),           // null = neutral
  politicalCandidateName: text("political_candidate_name"),
  targetStates: jsonb("target_states").$type<string[]>().notNull().default([]),
  targetLgas: jsonb("target_lgas").$type<string[]>().notNull().default([]),
  crisisEngagementDropPct: numeric("crisis_engagement_drop_pct", { precision: 6, scale: 2 }).notNull().default("30"),
  crisisFollowerLossPct: numeric("crisis_follower_loss_pct", { precision: 6, scale: 2 }).notNull().default("5"),
  crisisNegativeSentimentPct: numeric("crisis_negative_sentiment_pct", { precision: 6, scale: 2 }).notNull().default("60"),
  alertWhatsapp: text("alert_whatsapp"),
  alertEmail: text("alert_email"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Sentiment Keyword Monitors ───────────────────────────────────────────────
export const sentimentKeywordMonitorsTable = pgTable("sentiment_keyword_monitors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  configId: integer("config_id").notNull(),
  keyword: text("keyword").notNull(),
  type: text("type").notNull().default("hashtag"), // hashtag | keyword | handle
  platform: text("platform").notNull().default("all"),
  alertOnSpike: boolean("alert_on_spike").notNull().default(true),
  alertOnNegative: boolean("alert_on_negative").notNull().default(true),
  baselineScore: numeric("baseline_score", { precision: 6, scale: 4 }).notNull().default("0.5"), // 0 negative – 1 positive
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Sentiment Events ─────────────────────────────────────────────────────────
export const sentimentEventsTable = pgTable("sentiment_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  monitorId: integer("monitor_id").notNull(),
  keyword: text("keyword").notNull(),
  sampleText: text("sample_text"),
  sentimentScore: numeric("sentiment_score", { precision: 6, scale: 4 }).notNull().default("0.5"), // 0–1
  sentimentLabel: text("sentiment_label").notNull().default("neutral"), // positive | neutral | negative
  volume: integer("volume").notNull().default(1),
  platform: text("platform").notNull().default("all"),
  aiAnalysis: text("ai_analysis"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Competitor Accounts ──────────────────────────────────────────────────────
export const competitorAccountsTable = pgTable("competitor_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  configId: integer("config_id").notNull(),
  handle: text("handle").notNull(),
  platform: text("platform").notNull().default("instagram"),
  displayName: text("display_name"),
  category: text("category").notNull().default("general"), // political | music | brand | media
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Competitor Snapshots ─────────────────────────────────────────────────────
export const competitorSnapshotsTable = pgTable("competitor_snapshots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  competitorId: integer("competitor_id").notNull(),
  followerCount: integer("follower_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  postsCount: integer("posts_count").notNull().default(0),
  postsPerWeek: numeric("posts_per_week", { precision: 6, scale: 2 }).notNull().default("0"),
  avgEngagementRate: numeric("avg_engagement_rate", { precision: 6, scale: 4 }).notNull().default("0"), // percent
  topPostUrl: text("top_post_url"),
  topPostEngagement: integer("top_post_engagement").notNull().default(0),
  topPostCaption: text("top_post_caption"),
  snapshotDate: timestamp("snapshot_date", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Crisis Alerts ────────────────────────────────────────────────────────────
export const crisisAlertsTable = pgTable("crisis_alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  configId: integer("config_id").notNull(),
  type: text("type").notNull(), // engagement_drop | follower_loss | negative_sentiment | competitor_surge
  severity: text("severity").notNull().default("medium"), // low | medium | high | critical
  title: text("title").notNull(),
  description: text("description").notNull(),
  triggeredValue: numeric("triggered_value", { precision: 10, scale: 4 }),
  thresholdValue: numeric("threshold_value", { precision: 10, scale: 4 }),
  platform: text("platform"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  notificationSent: boolean("notification_sent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── ROI Attribution Events ───────────────────────────────────────────────────
export const roiAttributionEventsTable = pgTable("roi_attribution_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  configId: integer("config_id").notNull(),
  contentAction: text("content_action").notNull(), // post_published | live_session | campaign_burst | story | reel
  contentRef: text("content_ref"),                  // post ID, session ID, or free text
  outcomeType: text("outcome_type").notNull(),       // download | purchase | signup | form_fill | click | lead
  outcomeCount: integer("outcome_count").notNull().default(1),
  estimatedRevenueNgn: numeric("estimated_revenue_ngn", { precision: 12, scale: 2 }).notNull().default("0"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  manualTag: text("manual_tag"),
  platform: text("platform"),
  attributionModel: text("attribution_model").notNull().default("last_touch"), // last_touch | first_touch | linear
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Intelligence Notification Logs ──────────────────────────────────────────
export const intelligenceNotificationLogsTable = pgTable("intelligence_notification_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  alertId: integer("alert_id").notNull(),
  channel: text("channel").notNull(),       // email | whatsapp | no_provider_configured
  recipient: text("recipient"),
  status: text("status").notNull().default("pending"), // sent | failed | no_provider_configured
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Event Mode Configs (AFRIMA/Awards) ───────────────────────────────────────
export const eventModeConfigsTable = pgTable("event_mode_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  configId: integer("config_id").notNull(),
  eventName: text("event_name").notNull(),
  eventDate: timestamp("event_date", { withTimezone: true }),
  hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
  votingLinks: jsonb("voting_links").$type<{ label: string; url: string }[]>().notNull().default([]),
  hypeSeriesEnabled: boolean("hype_series_enabled").notNull().default(false),
  hypeSeriesDays: integer("hype_series_days").notNull().default(30),
  totalVoteCount: integer("total_vote_count").notNull().default(0),
  recapGenerated: boolean("recap_generated").notNull().default(false),
  recapText: text("recap_text"),
  phase: text("phase").notNull().default("pre"), // pre | live | post
  contentSchedule: jsonb("content_schedule").$type<{ day: number; type: string; caption: string; platform: string }[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
