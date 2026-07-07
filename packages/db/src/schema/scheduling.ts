import { pgTable, text, serial, timestamp, integer, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const PLATFORMS = ["instagram", "tiktok", "x", "youtube", "facebook", "threads"] as const;
export type Platform = typeof PLATFORMS[number];

export const POST_STATUSES = ["draft", "scheduled", "published", "failed"] as const;
export type PostStatus = typeof POST_STATUSES[number];

export const CAPTION_TONES = ["pidgin", "yoruba", "igbo", "hausa", "formal"] as const;
export type CaptionTone = typeof CAPTION_TONES[number];

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#2dd172"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
  caption: text("caption").notNull(),
  mediaUrls: jsonb("media_urls").$type<string[]>().notNull().default([]),
  platforms: jsonb("platforms").$type<Platform[]>().notNull().default([]),
  status: text("status").$type<PostStatus>().notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  tone: text("tone").$type<CaptionTone>(),
  hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
  platformVariants: jsonb("platform_variants").$type<Record<string, string>>().default({}),
  engagementScore: integer("engagement_score").notNull().default(0),
  isRecycled: boolean("is_recycled").notNull().default(false),
  originalPostId: integer("original_post_id"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const platformAccountsTable = pgTable("platform_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  platform: text("platform").$type<Platform>().notNull(),
  handle: text("handle").notNull(),
  displayName: text("display_name"),
  connected: boolean("connected").notNull().default(false),
  followerCount: integer("follower_count").notNull().default(0),
  // OAuth token fields — stored AES-256-GCM encrypted
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  platformUserId: text("platform_user_id"),
  scopes: jsonb("scopes").$type<string[]>(),
  // Temporary PKCE / state storage during the OAuth redirect round-trip
  oauthState: text("oauth_state"),
  oauthStateExpiresAt: timestamp("oauth_state_expires_at", { withTimezone: true }),
  // Last error from platform API
  errorMessage: text("error_message"),
  // rate_limit | auth_failure | content_policy
  errorCode: text("error_code"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("platform_accounts_user_platform_idx").on(t.userId, t.platform)]);

export const hashtagCacheTable = pgTable("hashtag_cache", {
  id: serial("id").primaryKey(),
  platform: text("platform").$type<Platform>().notNull(),
  hashtag: text("hashtag").notNull(),
  region: text("region").notNull().default("NG"),
  trendScore: integer("trend_score").notNull().default(0),
  category: text("category"),
  refreshedAt: timestamp("refreshed_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const postRevisionsTable = pgTable("post_revisions", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  caption: text("caption").notNull(),
  platforms: jsonb("platforms").$type<Platform[]>().notNull().default([]),
  hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
  status: text("status").$type<PostStatus>().notNull(),
  scheduledAt: timestamp("scheduled_at"),
  changeNote: text("change_note"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlatformAccountSchema = createInsertSchema(platformAccountsTable).omit({ id: true, createdAt: true });
export const insertHashtagSchema = createInsertSchema(hashtagCacheTable).omit({ id: true });
export const insertPostRevisionSchema = createInsertSchema(postRevisionsTable).omit({ id: true, createdAt: true });

export type Campaign = typeof campaignsTable.$inferSelect;
export type Post = typeof postsTable.$inferSelect;
export type PlatformAccount = typeof platformAccountsTable.$inferSelect;
export type HashtagCache = typeof hashtagCacheTable.$inferSelect;
export type PostRevision = typeof postRevisionsTable.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
