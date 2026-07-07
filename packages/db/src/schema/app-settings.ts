import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const platformOauthConfigsTable = pgTable("platform_oauth_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  appId: text("app_id"),
  appSecret: text("app_secret"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("platform_oauth_configs_user_platform_idx").on(t.userId, t.platform),
]);

export type PlatformOauthConfig = typeof platformOauthConfigsTable.$inferSelect;
