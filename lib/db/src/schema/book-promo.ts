import { pgTable, serial, integer, text, boolean, timestamp, numeric } from "drizzle-orm/pg-core";

export const promoCampaignsTable = pgTable("promo_campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  bookTitle: text("book_title").notNull().default("999"),
  coverImageUrl: text("cover_image_url"),
  synopsis: text("synopsis"),
  chapterPreview: text("chapter_preview"),
  destinationUrl: text("destination_url").notNull(),
  paystackLink: text("paystack_link"),
  launchDate: timestamp("launch_date", { withTimezone: true }),
  primaryColor: text("primary_color").notNull().default("#16a34a"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const promoLinksTable = pgTable("promo_links", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  userId: integer("user_id").notNull(),
  channel: text("channel").notNull(),
  label: text("label").notNull(),
  clickCount: integer("click_count").notNull().default(0),
  conversionCount: integer("conversion_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const linkClicksTable = pgTable("link_clicks", {
  id: serial("id").primaryKey(),
  promoLinkId: integer("promo_link_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  referer: text("referer"),
  clickedAt: timestamp("clicked_at", { withTimezone: true }).defaultNow().notNull(),
});

export const purchaseVerificationsTable = pgTable("purchase_verifications", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  userId: integer("user_id").notNull(),
  fanName: text("fan_name").notNull(),
  fanEmail: text("fan_email").notNull(),
  fanPhone: text("fan_phone"),
  paymentRef: text("payment_ref"),
  receiptNote: text("receipt_note"),
  status: text("status").notNull().default("pending"),
  bonusCode: text("bonus_code"),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const affiliateCommissionsTable = pgTable("affiliate_commissions", {
  id: serial("id").primaryKey(),
  promoLinkId: integer("promo_link_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  userId: integer("user_id").notNull(),
  ambassadorName: text("ambassador_name").notNull(),
  ambassadorEmail: text("ambassador_email").notNull(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull().default("10"),
  totalClicks: integer("total_clicks").notNull().default(0),
  totalConversions: integer("total_conversions").notNull().default(0),
  totalEarned: numeric("total_earned", { precision: 12, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  payoutStatus: text("payout_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
