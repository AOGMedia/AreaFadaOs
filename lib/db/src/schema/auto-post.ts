import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const postDraftsTable = pgTable("post_drafts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title"),
  sourceCaption: text("source_caption").notNull(),
  mediaUrls: jsonb("media_urls").$type<string[]>().notNull().default([]),
  selectedPlatforms: jsonb("selected_platforms").$type<string[]>().notNull().default([]),
  selectedAccountIds: jsonb("selected_account_ids").$type<number[]>().notNull().default([]),
  selectedGroupId: integer("selected_group_id"),
  platformVariants: jsonb("platform_variants").$type<Record<string, string>>().notNull().default({}),
  platformHashtags: jsonb("platform_hashtags").$type<Record<string, string[]>>().notNull().default({}),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  status: text("status").notNull().default("draft"),
  approvalRequired: boolean("approval_required").notNull().default(false),
  complianceChecked: boolean("compliance_checked").notNull().default(false),
  complianceScore: integer("compliance_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const publishJobsTable = pgTable("publish_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  draftId: integer("draft_id").notNull(),
  platform: text("platform").notNull(),
  platformAccountId: integer("platform_account_id"),
  caption: text("caption").notNull(),
  mediaUrls: jsonb("media_urls").$type<string[]>().notNull().default([]),
  hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  errorMessage: text("error_message"),
  errorCode: text("error_code"),
  platformPostId: text("platform_post_id"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accountGroupsTable = pgTable("account_groups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#2dd172"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accountGroupMembersTable = pgTable("account_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  userId: integer("user_id").notNull(),
  platform: text("platform").notNull(),
  handle: text("handle").notNull(),
  displayName: text("display_name"),
  platformAccountId: integer("platform_account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const approvalRequestsTable = pgTable("approval_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  draftId: integer("draft_id").notNull(),
  requestedByUserId: integer("requested_by_user_id").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  notificationLog: jsonb("notification_log").$type<Array<{ type: string; sentAt: string; channel: string; recipient?: string }>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const complianceFlagsTable = pgTable("compliance_flags", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  draftId: integer("draft_id").notNull(),
  overallScore: integer("overall_score").notNull().default(100),
  flags: jsonb("flags").$type<Array<{ type: string; severity: string; message: string; guideline: string }>>().notNull().default([]),
  platform: text("platform"),
  recommendation: text("recommendation"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});
