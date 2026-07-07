import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const supportConversationsTable = pgTable("support_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  platformConversationId: text("platform_conversation_id"),
  contactName: text("contact_name").notNull(),
  contactHandle: text("contact_handle"),
  contactAvatarUrl: text("contact_avatar_url"),
  contactEmail: text("contact_email"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  labels: text("labels").default("[]"),
  unreadCount: integer("unread_count").notNull().default(0),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const supportMessagesTable = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => supportConversationsTable.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(),
  content: text("content").notNull(),
  senderName: text("sender_name"),
  attachmentUrl: text("attachment_url"),
  attachmentType: text("attachment_type"),
  externalMessageId: text("external_message_id"),
  readAt: timestamp("read_at"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export type SupportConversation = typeof supportConversationsTable.$inferSelect;
export type SupportMessage = typeof supportMessagesTable.$inferSelect;
