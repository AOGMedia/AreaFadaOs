import { pgTable, serial, integer, text, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";

export const clipAccountsTable = pgTable("clip_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  handle: text("handle").notNull(),
  personaLabel: text("persona_label").notNull().default("General"),
  personaProfile: jsonb("persona_profile").$type<{
    ageRange?: string; interests?: string[]; language?: string; tone?: string; region?: string;
  }>().notNull().default({}),
  color: text("color").notNull().default("#3b82f6"),
  status: text("status").notNull().default("active"),
  queueCount: integer("queue_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sourceVideosTable = pgTable("source_videos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  durationSeconds: integer("duration_seconds"),
  transcript: text("transcript"),
  analysisStatus: text("analysis_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const clipJobsTable = pgTable("clip_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sourceVideoId: integer("source_video_id").notNull(),
  status: text("status").notNull().default("pending"),
  momentsDetected: jsonb("moments_detected").$type<Array<{
    label: string; startSeconds: number; endSeconds: number;
    retentionScore: number; suggestedFormats: string[]; suggestedCaption: string;
  }>>().notNull().default([]),
  errorMessage: text("error_message"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const clipsTable = pgTable("clips", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sourceVideoId: integer("source_video_id").notNull(),
  accountId: integer("account_id"),
  jobId: integer("job_id"),
  label: text("label").notNull(),
  startSeconds: integer("start_seconds").notNull(),
  endSeconds: integer("end_seconds").notNull(),
  format: text("format").notNull().default("9:16"),
  captionTone: text("caption_tone").notNull().default("african_english"),
  captionText: text("caption_text"),
  hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
  coverFrameTime: integer("cover_frame_time").notNull().default(0),
  status: text("status").notNull().default("draft"),
  performanceScore: numeric("performance_score", { precision: 6, scale: 2 }),
  collabEnabled: boolean("collab_enabled").notNull().default(false),
  collabAccountId: integer("collab_account_id"),
  watermarkApplied: boolean("watermark_applied").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const clipSchedulesTable = pgTable("clip_schedules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  clipId: integer("clip_id").notNull(),
  accountId: integer("account_id").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("scheduled"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const brandOverlayConfigsTable = pgTable("brand_overlay_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  accountId: integer("account_id").notNull(),
  watermarkUrl: text("watermark_url"),
  watermarkPosition: text("watermark_position").notNull().default("bottom_right"),
  watermarkOpacity: numeric("watermark_opacity", { precision: 3, scale: 2 }).notNull().default("0.80"),
  introBumperUrl: text("intro_bumper_url"),
  endCardTemplate: text("end_card_template").notNull().default("minimal"),
  endCardText: text("end_card_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const clipPerformanceLogsTable = pgTable("clip_performance_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  clipId: integer("clip_id").notNull(),
  accountId: integer("account_id").notNull(),
  views: integer("views").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  saves: integer("saves").notNull().default(0),
  watchTimeSeconds: integer("watch_time_seconds").notNull().default(0),
  source: text("source").notNull().default("manual"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
