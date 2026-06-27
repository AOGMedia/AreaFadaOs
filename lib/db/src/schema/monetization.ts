import { pgTable, text, serial, timestamp, integer, boolean, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const DEAL_STATUSES = ["prospecting", "negotiating", "active", "completed", "cancelled"] as const;
export type DealStatus = typeof DEAL_STATUSES[number];

export const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "cancelled"] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

export const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "USD"] as const;
export type Currency = typeof CURRENCIES[number];

export const PAYMENT_GATEWAYS = ["paystack", "flutterwave", "manual"] as const;
export type PaymentGateway = typeof PAYMENT_GATEWAYS[number];

export const brandDealsTable = pgTable("brand_deals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  brandName: text("brand_name").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  dealValue: numeric("deal_value", { precision: 14, scale: 2 }).notNull().default("0"),
  currency: text("currency").$type<Currency>().notNull().default("NGN"),
  status: text("status").$type<DealStatus>().notNull().default("prospecting"),
  deliverables: text("deliverables"),
  platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  dealId: integer("deal_id").references(() => brandDealsTable.id, { onDelete: "set null" }),
  invoiceNumber: text("invoice_number").notNull(),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email").notNull(),
  currency: text("currency").$type<Currency>().notNull().default("NGN"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
  status: text("status").$type<InvoiceStatus>().notNull().default("draft"),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  paymentGateway: text("payment_gateway").$type<PaymentGateway>(),
  paymentLink: text("payment_link"),
  paymentRef: text("payment_ref"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const invoiceLineItemsTable = pgTable("invoice_line_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const affiliateLinksTable = pgTable("affiliate_links", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  destinationUrl: text("destination_url").notNull(),
  slug: text("slug").notNull(),
  platform: text("platform"),
  campaignTag: text("campaign_tag"),
  clickCount: integer("click_count").notNull().default(0),
  conversionCount: integer("conversion_count").notNull().default(0),
  revenueGenerated: numeric("revenue_generated", { precision: 14, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const affiliateClicksTable = pgTable("affiliate_clicks", {
  id: serial("id").primaryKey(),
  linkId: integer("link_id").notNull().references(() => affiliateLinksTable.id, { onDelete: "cascade" }),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  referer: text("referer"),
  country: text("country"),
  converted: boolean("converted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentRemindersTable = pgTable("payment_reminders", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  channel: text("channel").notNull().default("email"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  status: text("status").notNull().default("sent"),
  message: text("message"),
});

export const insertBrandDealSchema = createInsertSchema(brandDealsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItemsTable).omit({ id: true, createdAt: true });
export const insertAffiliateLinkSchema = createInsertSchema(affiliateLinksTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAffiliateClickSchema = createInsertSchema(affiliateClicksTable).omit({ id: true, createdAt: true });
export const insertPaymentReminderSchema = createInsertSchema(paymentRemindersTable).omit({ id: true });

export type BrandDeal = typeof brandDealsTable.$inferSelect;
export type Invoice = typeof invoicesTable.$inferSelect;
export type InvoiceLineItem = typeof invoiceLineItemsTable.$inferSelect;
export type AffiliateLink = typeof affiliateLinksTable.$inferSelect;
export type AffiliateClick = typeof affiliateClicksTable.$inferSelect;
export type PaymentReminder = typeof paymentRemindersTable.$inferSelect;
