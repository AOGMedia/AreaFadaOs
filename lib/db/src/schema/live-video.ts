import { pgTable, serial, integer, text, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";

export const liveSessionsTable = pgTable("live_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  status: text("status").notNull().default("scheduled"),
  platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
  rtmpUrl: text("rtmp_url"),
  streamKey: text("stream_key"),
  peakViewers: integer("peak_viewers").notNull().default(0),
  totalViewers: integer("total_viewers").notNull().default(0),
  countdownPostsEnabled: boolean("countdown_posts_enabled").notNull().default(true),
  replayUrl: text("replay_url"),
  chapterTimestamps: jsonb("chapter_timestamps").$type<Array<{ label: string; seconds: number }>>().default([]),
  totalRevenue: numeric("total_revenue", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const livePlatformConfigsTable = pgTable("live_platform_configs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  userId: integer("user_id").notNull(),
  platform: text("platform").notNull(),
  streamKey: text("stream_key"),
  rtmpEndpoint: text("rtmp_endpoint"),
  broadcastUrl: text("broadcast_url"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const liveChatMessagesTable = pgTable("live_chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  userId: integer("user_id").notNull(),
  platform: text("platform").notNull(),
  authorName: text("author_name").notNull(),
  authorHandle: text("author_handle"),
  message: text("message").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  isQuestion: boolean("is_question").notNull().default(false),
  isModerated: boolean("is_moderated").notNull().default(false),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
});

export const liveRevenueEventsTable = pgTable("live_revenue_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  userId: integer("user_id").notNull(),
  platform: text("platform").notNull(),
  eventType: text("event_type").notNull(),
  senderName: text("sender_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("NGN"),
  message: text("message"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
});

export const postLiveClipsTable = pgTable("post_live_clips", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  userId: integer("user_id").notNull(),
  label: text("label").notNull(),
  startSeconds: integer("start_seconds").notNull(),
  endSeconds: integer("end_seconds").notNull(),
  aiCaption: text("ai_caption"),
  platform: text("platform"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const liveReminderSignupsTable = pgTable("live_reminder_signups", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  userId: integer("user_id").notNull(),
  fanName: text("fan_name").notNull(),
  fanEmail: text("fan_email"),
  fanPhone: text("fan_phone"),
  channel: text("channel").notNull().default("email"),
  reminded: boolean("reminded").notNull().default(false),
  remindedAt: timestamp("reminded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const liveModerationRulesTable = pgTable("live_moderation_rules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  ruleType: text("rule_type").notNull().default("keyword"),
  pattern: text("pattern").notNull(),
  action: text("action").notNull().default("hide"),
  active: boolean("active").notNull().default(true),
  hitCount: integer("hit_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const liveNotificationEventsTable = pgTable("live_notification_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  userId: integer("user_id").notNull(),
  recipientId: integer("recipient_id"),
  channel: text("channel").notNull(),
  recipient: text("recipient").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status").notNull().default("queued"),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
