import { pgTable, serial, integer, text, numeric, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

export const ambassadorsTable = pgTable("ambassadors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  state: text("state").notNull(),
  zone: text("zone").notNull(),
  city: text("city"),
  tier: text("tier").notNull().default("member"),
  status: text("status").notNull().default("active"),
  bio: text("bio"),
  avatarInitials: text("avatar_initials"),
  platform: text("platform"),
  handle: text("handle"),
  followerCount: integer("follower_count").notNull().default(0),
  totalPoints: integer("total_points").notNull().default(0),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  referrals: integer("referrals").notNull().default(0),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ambassadorPointsTable = pgTable("ambassador_points", {
  id: serial("id").primaryKey(),
  ambassadorId: integer("ambassador_id").notNull(),
  userId: integer("user_id").notNull(),
  action: text("action").notNull(),
  points: integer("points").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const gamificationConfigsTable = pgTable("gamification_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  actionKey: text("action_key").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  pointValue: integer("point_value").notNull().default(10),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rewardTiersTable = pgTable("reward_tiers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  minPoints: integer("min_points").notNull(),
  maxPoints: integer("max_points"),
  badgeColor: text("badge_color").notNull().default("#f59e0b"),
  rewardDescription: text("reward_description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ambassadorTasksTable = pgTable("ambassador_tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  deadline: timestamp("deadline", { withTimezone: true }),
  targetGroup: text("target_group").notNull().default("all"),
  targetStates: jsonb("target_states").default([]),
  pointReward: integer("point_reward").notNull().default(0),
  status: text("status").notNull().default("active"),
  totalAssigned: integer("total_assigned").notNull().default(0),
  completedCount: integer("completed_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const taskCompletionsTable = pgTable("task_completions", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  ambassadorId: integer("ambassador_id").notNull(),
  userId: integer("user_id").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
  notes: text("notes"),
});

export const microInfluencersTable = pgTable("micro_influencers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  handle: text("handle").notNull(),
  platform: text("platform").notNull(),
  state: text("state").notNull(),
  zone: text("zone"),
  niche: text("niche").notNull(),
  followerCount: integer("follower_count").notNull().default(0),
  engagementRate: numeric("engagement_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  status: text("status").notNull().default("available"),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappBroadcastsTable = pgTable("whatsapp_broadcasts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  listName: text("list_name").notNull(),
  message: text("message").notNull(),
  sentCount: integer("sent_count").notNull().default(0),
  deliveryCount: integer("delivery_count").notNull().default(0),
  linkClicks: integer("link_clicks").notNull().default(0),
  responseCount: integer("response_count").notNull().default(0),
  broadcastDate: timestamp("broadcast_date", { withTimezone: true }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
