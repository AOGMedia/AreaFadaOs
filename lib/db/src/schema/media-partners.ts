import { pgTable, serial, integer, text, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ─── Partner Invites ──────────────────────────────────────────────────────────
// partner_type: creator_partner | brand_partner | agency_reseller | media_house | political_campaign
// status: sent | opened | signed_up | converted | expired | revoked
export const partnerInvitesTable = pgTable("partner_invites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  partnerType: text("partner_type").notNull().default("creator_partner"),
  orgName: text("org_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull().default("sent"),
  customMessage: text("custom_message"),
  tierPreset: text("tier_preset").notNull().default("pro"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  signedUpAt: timestamp("signed_up_at", { withTimezone: true }),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  sentCount: integer("sent_count").notNull().default(1),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Partner Profiles ─────────────────────────────────────────────────────────
export const partnerProfilesTable = pgTable("partner_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  inviteId: integer("invite_id"),
  orgName: text("org_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  website: text("website"),
  partnerType: text("partner_type").notNull().default("creator_partner"),
  tier: text("tier").notNull().default("pro"),
  accountManagerName: text("account_manager_name"),
  accountManagerEmail: text("account_manager_email"),
  dealValue: numeric("deal_value", { precision: 12, scale: 2 }),
  dealNotes: text("deal_notes"),
  region: text("region").notNull().default("Nigeria"),
  country: text("country").notNull().default("NG"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  activityLog: jsonb("activity_log").$type<Array<{
    action: string; note: string; at: string;
  }>>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Outreach Email Logs ──────────────────────────────────────────────────────
export const outreachEmailLogsTable = pgTable("outreach_email_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  inviteId: integer("invite_id"),
  toEmail: text("to_email").notNull(),
  toName: text("to_name").notNull(),
  orgName: text("org_name").notNull(),
  partnerType: text("partner_type").notNull().default("creator_partner"),
  templateKey: text("template_key").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | delivered | bounced | simulated
  resendMessageId: text("resend_message_id"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Partner Directory Entries ────────────────────────────────────────────────
// Curated African / diaspora media partners target list (shared, no tenant scoping)
export const partnerDirectoryEntriesTable = pgTable("partner_directory_entries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  orgType: text("org_type").notNull().default("media_house"), // media_house | pr_firm | talent_agency | record_label | broadcast_network | digital_publisher | political_media
  region: text("region").notNull().default("West Africa"),
  country: text("country").notNull().default("NG"),
  website: text("website"),
  email: text("email"),
  description: text("description"),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Per-Tenant Directory Outreach State ──────────────────────────────────────
// Tracks each agency tenant's outreach status/notes per directory entry.
// Isolates pipeline state so one tenant's actions never overwrite another's.
export const partnerDirectoryOutreachTable = pgTable("partner_directory_outreach", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  directoryEntryId: integer("directory_entry_id").notNull(),
  outreachStatus: text("outreach_status").notNull().default("not_contacted"), // not_contacted | invited | in_talks | onboarded | declined
  inviteId: integer("invite_id"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
