CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"tier" text DEFAULT 'free' NOT NULL,
	"bio" text,
	"country" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#2dd172' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hashtag_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"hashtag" text NOT NULL,
	"region" text DEFAULT 'NG' NOT NULL,
	"trend_score" integer DEFAULT 0 NOT NULL,
	"category" text,
	"refreshed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"connected" boolean DEFAULT false NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"platform_user_id" text,
	"scopes" jsonb,
	"oauth_state" text,
	"error_message" text,
	"error_code" text,
	"updated_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"caption" text NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"scheduled_at" timestamp,
	"change_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"campaign_id" integer,
	"caption" text NOT NULL,
	"media_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"tone" text,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"platform_variants" jsonb DEFAULT '{}'::jsonb,
	"engagement_score" integer DEFAULT 0 NOT NULL,
	"is_recycled" boolean DEFAULT false NOT NULL,
	"original_post_id" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_id" integer NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"referer" text,
	"country" text,
	"converted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"destination_url" text NOT NULL,
	"slug" text NOT NULL,
	"platform" text,
	"campaign_tag" text,
	"click_count" integer DEFAULT 0 NOT NULL,
	"conversion_count" integer DEFAULT 0 NOT NULL,
	"revenue_generated" numeric(14, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"brand_name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"deal_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'inbound' NOT NULL,
	"deliverables" text,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"deal_id" integer,
	"invoice_number" text NOT NULL,
	"client_name" text NOT NULL,
	"client_email" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"due_date" timestamp,
	"paid_at" timestamp,
	"payment_gateway" text,
	"payment_link" text,
	"payment_ref" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "analytics_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"client_name" text NOT NULL,
	"client_email" text,
	"logo_url" text,
	"platforms" jsonb DEFAULT '[]'::jsonb,
	"date_from" timestamp with time zone,
	"date_to" timestamp with time zone,
	"brand_color" text DEFAULT '#7c3aed',
	"status" text DEFAULT 'pending' NOT NULL,
	"download_url" text,
	"report_data" jsonb,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"platform" text NOT NULL,
	"account_handle" text NOT NULL,
	"snapshot_date" timestamp with time zone NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"following" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"engagement_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"profile_views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"platform" text NOT NULL,
	"region" text NOT NULL,
	"region_type" text NOT NULL,
	"label" text NOT NULL,
	"percentage" numeric(5, 2) DEFAULT '0' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"lat" numeric(8, 5),
	"lng" numeric(8, 5),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"platform" text NOT NULL,
	"post_performance_id" integer,
	"score" integer DEFAULT 50 NOT NULL,
	"label" text DEFAULT 'medium' NOT NULL,
	"comment_quality" numeric(5, 2) DEFAULT '0' NOT NULL,
	"follower_ratio" numeric(5, 2) DEFAULT '0' NOT NULL,
	"interaction_velocity" numeric(5, 2) DEFAULT '0' NOT NULL,
	"bot_risk" numeric(5, 2) DEFAULT '0' NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_performance" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"post_id" integer,
	"platform" text NOT NULL,
	"external_id" text,
	"caption" text,
	"media_type" text,
	"published_at" timestamp with time zone,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"engagement_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"engagement_score" integer DEFAULT 0 NOT NULL,
	"quality_label" text DEFAULT 'medium' NOT NULL,
	"quality_reason" text,
	"bot_risk" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_digests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"week_end" timestamp with time zone NOT NULL,
	"narrative" text NOT NULL,
	"top_platform" text,
	"total_reach" integer DEFAULT 0 NOT NULL,
	"total_engagements" integer DEFAULT 0 NOT NULL,
	"avg_engagement_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"followers_gained" integer DEFAULT 0 NOT NULL,
	"best_post" jsonb,
	"email_sent" boolean DEFAULT false NOT NULL,
	"whatsapp_logged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ambassador_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"ambassador_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"action" text NOT NULL,
	"points" integer NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ambassador_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"deadline" timestamp with time zone,
	"target_group" text DEFAULT 'all' NOT NULL,
	"target_states" jsonb DEFAULT '[]'::jsonb,
	"point_reward" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"total_assigned" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ambassadors" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"state" text NOT NULL,
	"zone" text NOT NULL,
	"city" text,
	"tier" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"bio" text,
	"avatar_initials" text,
	"platform" text,
	"handle" text,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"referrals" integer DEFAULT 0 NOT NULL,
	"portal_token" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gamification_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"action_key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"point_value" integer DEFAULT 10 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "micro_influencers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"platform" text NOT NULL,
	"state" text NOT NULL,
	"zone" text,
	"niche" text NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"engagement_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"status" text DEFAULT 'available' NOT NULL,
	"last_contact_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"min_points" integer NOT NULL,
	"max_points" integer,
	"badge_color" text DEFAULT '#f59e0b' NOT NULL,
	"reward_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"ambassador_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "whatsapp_broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"list_name" text NOT NULL,
	"message" text NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"delivery_count" integer DEFAULT 0 NOT NULL,
	"link_clicks" integer DEFAULT 0 NOT NULL,
	"response_count" integer DEFAULT 0 NOT NULL,
	"broadcast_date" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"promo_link_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"ambassador_name" text NOT NULL,
	"ambassador_email" text NOT NULL,
	"commission_rate" numeric(5, 2) DEFAULT '10' NOT NULL,
	"total_clicks" integer DEFAULT 0 NOT NULL,
	"total_conversions" integer DEFAULT 0 NOT NULL,
	"total_earned" numeric(12, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payout_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"promo_link_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"ip" text,
	"user_agent" text,
	"referer" text,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"book_title" text DEFAULT '999' NOT NULL,
	"cover_image_url" text,
	"synopsis" text,
	"chapter_preview" text,
	"destination_url" text NOT NULL,
	"paystack_link" text,
	"launch_date" timestamp with time zone,
	"primary_color" text DEFAULT '#16a34a' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_campaigns_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "promo_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"channel" text NOT NULL,
	"label" text NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"conversion_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"fan_name" text NOT NULL,
	"fan_email" text NOT NULL,
	"fan_phone" text,
	"payment_ref" text,
	"receipt_note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"bonus_code" text,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"platform" text NOT NULL,
	"author_name" text NOT NULL,
	"author_handle" text,
	"message" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"is_question" boolean DEFAULT false NOT NULL,
	"is_moderated" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_moderation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"rule_type" text DEFAULT 'keyword' NOT NULL,
	"pattern" text NOT NULL,
	"action" text DEFAULT 'hide' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_notification_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"recipient_id" integer,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_platform_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"platform" text NOT NULL,
	"stream_key" text,
	"rtmp_endpoint" text,
	"broadcast_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"validated_at" timestamp with time zone,
	"current_viewers" integer DEFAULT 0 NOT NULL,
	"restream_channel_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_reminder_signups" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"fan_name" text NOT NULL,
	"fan_email" text,
	"fan_phone" text,
	"channel" text DEFAULT 'email' NOT NULL,
	"reminded" boolean DEFAULT false NOT NULL,
	"reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_revenue_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"platform" text NOT NULL,
	"event_type" text NOT NULL,
	"sender_name" text NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"message" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"thumbnail_url" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rtmp_url" text,
	"stream_key" text,
	"peak_viewers" integer DEFAULT 0 NOT NULL,
	"total_viewers" integer DEFAULT 0 NOT NULL,
	"countdown_posts_enabled" boolean DEFAULT true NOT NULL,
	"replay_url" text,
	"chapter_timestamps" jsonb DEFAULT '[]'::jsonb,
	"total_revenue" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_live_clips" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"label" text NOT NULL,
	"start_seconds" integer NOT NULL,
	"end_seconds" integer NOT NULL,
	"ai_caption" text,
	"platform" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_overlay_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"watermark_url" text,
	"watermark_position" text DEFAULT 'bottom_right' NOT NULL,
	"watermark_opacity" numeric(3, 2) DEFAULT '0.80' NOT NULL,
	"intro_bumper_url" text,
	"end_card_template" text DEFAULT 'minimal' NOT NULL,
	"end_card_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clip_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"persona_label" text DEFAULT 'General' NOT NULL,
	"persona_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"queue_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clip_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"source_video_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"moments_detected" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clip_performance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"clip_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"watch_time_seconds" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clip_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"clip_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clips" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"source_video_id" integer NOT NULL,
	"account_id" integer,
	"job_id" integer,
	"label" text NOT NULL,
	"start_seconds" integer NOT NULL,
	"end_seconds" integer NOT NULL,
	"format" text DEFAULT '9:16' NOT NULL,
	"caption_tone" text DEFAULT 'african_english' NOT NULL,
	"caption_text" text,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cover_frame_time" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"performance_score" numeric(6, 2),
	"collab_enabled" boolean DEFAULT false NOT NULL,
	"collab_account_id" integer,
	"watermark_applied" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"duration_seconds" integer,
	"transcript" text,
	"analysis_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"platform_account_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#2dd172' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"draft_id" integer NOT NULL,
	"requested_by_user_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"notification_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"draft_id" integer NOT NULL,
	"overall_score" integer DEFAULT 100 NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"platform" text,
	"recommendation" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text,
	"source_caption" text NOT NULL,
	"media_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_account_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_group_id" integer,
	"platform_variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"platform_hashtags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"approval_required" boolean DEFAULT false NOT NULL,
	"compliance_checked" boolean DEFAULT false NOT NULL,
	"compliance_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"draft_id" integer NOT NULL,
	"platform" text NOT NULL,
	"platform_account_id" integer,
	"caption" text NOT NULL,
	"media_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"error_message" text,
	"error_code" text,
	"platform_post_id" text,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_channel_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"budget_allocation_ngn" numeric(12, 2) DEFAULT '0' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"cost_per_visit" numeric(8, 2),
	"status" text DEFAULT 'idle' NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "growth_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"platform_account_id" integer NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"follower_growth_rate" numeric(8, 4) DEFAULT '0' NOT NULL,
	"reach_count" integer DEFAULT 0 NOT NULL,
	"reach_growth_rate" numeric(8, 4) DEFAULT '0' NOT NULL,
	"engagement_velocity" numeric(8, 4) DEFAULT '0' NOT NULL,
	"health_score" integer DEFAULT 50 NOT NULL,
	"alert_threshold_rate" numeric(8, 4) DEFAULT '0',
	"alert_enabled" boolean DEFAULT false NOT NULL,
	"snapshot_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hook_library_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"title" text NOT NULL,
	"hook_text" text NOT NULL,
	"platform" text NOT NULL,
	"niche" text DEFAULT 'general' NOT NULL,
	"format" text DEFAULT 'caption' NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"curated" boolean DEFAULT false NOT NULL,
	"week_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_content_pieces" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"topic" text NOT NULL,
	"content_type" text DEFAULT 'blog' NOT NULL,
	"target_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"region" text DEFAULT 'NG' NOT NULL,
	"title" text,
	"body" text,
	"meta_description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"published_to_calendar" boolean DEFAULT false NOT NULL,
	"scheduled_post_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"destination_url" text NOT NULL,
	"budget_ngn" numeric(12, 2) DEFAULT '0' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"goal" text DEFAULT 'visits' NOT NULL,
	"target_region" text DEFAULT 'NG' NOT NULL,
	"total_visits" integer DEFAULT 0 NOT NULL,
	"total_conversions" integer DEFAULT 0 NOT NULL,
	"roi_percent" numeric(8, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"channel" text NOT NULL,
	"event_type" text DEFAULT 'click' NOT NULL,
	"tracked_link_slug" text,
	"referrer" text,
	"region" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"challenge_id" integer NOT NULL,
	"fan_profile_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"proof_text" text,
	"proof_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_vault_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content_type" text DEFAULT 'chapter' NOT NULL,
	"access_tier" integer DEFAULT 1 NOT NULL,
	"content_url" text,
	"thumbnail_url" text,
	"file_size" text,
	"download_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fan_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"point_value" integer DEFAULT 50 NOT NULL,
	"deadline" timestamp with time zone,
	"proof_type" text DEFAULT 'text' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"participant_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fan_points_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"fan_profile_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"action" text NOT NULL,
	"points" integer NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fan_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"phone" text,
	"state" text,
	"instagram_handle" text,
	"twitter_handle" text,
	"tiktok_handle" text,
	"referral_code" text NOT NULL,
	"referred_by_code" text,
	"fan_tier" integer DEFAULT 1 NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"referral_count" integer DEFAULT 0 NOT NULL,
	"purchase_verified" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fan_profiles_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "fan_tier_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"fan_profile_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"from_tier" integer NOT NULL,
	"to_tier" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merch_discount_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"fan_profile_id" integer NOT NULL,
	"code" text NOT NULL,
	"discount_percent" integer DEFAULT 15 NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merch_discount_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "og_invite_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"fan_profile_id" integer NOT NULL,
	"status" text DEFAULT 'waitlist' NOT NULL,
	"invite_link" text,
	"invited_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_intelligence_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'general' NOT NULL,
	"political_party" text,
	"political_candidate_name" text,
	"target_states" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_lgas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"crisis_engagement_drop_pct" numeric(6, 2) DEFAULT '30' NOT NULL,
	"crisis_follower_loss_pct" numeric(6, 2) DEFAULT '5' NOT NULL,
	"crisis_negative_sentiment_pct" numeric(6, 2) DEFAULT '60' NOT NULL,
	"alert_whatsapp" text,
	"alert_email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"config_id" integer NOT NULL,
	"handle" text NOT NULL,
	"platform" text DEFAULT 'instagram' NOT NULL,
	"display_name" text,
	"category" text DEFAULT 'general' NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"competitor_id" integer NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"posts_count" integer DEFAULT 0 NOT NULL,
	"posts_per_week" numeric(6, 2) DEFAULT '0' NOT NULL,
	"avg_engagement_rate" numeric(6, 4) DEFAULT '0' NOT NULL,
	"top_post_url" text,
	"top_post_engagement" integer DEFAULT 0 NOT NULL,
	"top_post_caption" text,
	"snapshot_date" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crisis_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"config_id" integer NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"triggered_value" numeric(10, 4),
	"threshold_value" numeric(10, 4),
	"platform" text,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"notification_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_mode_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"config_id" integer NOT NULL,
	"event_name" text NOT NULL,
	"event_date" timestamp with time zone,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"voting_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hype_series_enabled" boolean DEFAULT false NOT NULL,
	"hype_series_days" integer DEFAULT 30 NOT NULL,
	"total_vote_count" integer DEFAULT 0 NOT NULL,
	"recap_generated" boolean DEFAULT false NOT NULL,
	"recap_text" text,
	"phase" text DEFAULT 'pre' NOT NULL,
	"content_schedule" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intelligence_notification_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"alert_id" integer NOT NULL,
	"channel" text NOT NULL,
	"recipient" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roi_attribution_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"config_id" integer NOT NULL,
	"content_action" text NOT NULL,
	"content_ref" text,
	"outcome_type" text NOT NULL,
	"outcome_count" integer DEFAULT 1 NOT NULL,
	"estimated_revenue_ngn" numeric(12, 2) DEFAULT '0' NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"manual_tag" text,
	"platform" text,
	"attribution_model" text DEFAULT 'last_touch' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentiment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"monitor_id" integer NOT NULL,
	"keyword" text NOT NULL,
	"sample_text" text,
	"sentiment_score" numeric(6, 4) DEFAULT '0.5' NOT NULL,
	"sentiment_label" text DEFAULT 'neutral' NOT NULL,
	"volume" integer DEFAULT 1 NOT NULL,
	"platform" text DEFAULT 'all' NOT NULL,
	"ai_analysis" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentiment_keyword_monitors" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"config_id" integer NOT NULL,
	"keyword" text NOT NULL,
	"type" text DEFAULT 'hashtag' NOT NULL,
	"platform" text DEFAULT 'all' NOT NULL,
	"alert_on_spike" boolean DEFAULT true NOT NULL,
	"alert_on_negative" boolean DEFAULT true NOT NULL,
	"baseline_score" numeric(6, 4) DEFAULT '0.5' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"invite_id" integer,
	"to_email" text NOT NULL,
	"to_name" text NOT NULL,
	"org_name" text NOT NULL,
	"partner_type" text DEFAULT 'creator_partner' NOT NULL,
	"template_key" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resend_message_id" text,
	"opened_at" timestamp with time zone,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_directory_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"org_type" text DEFAULT 'media_house' NOT NULL,
	"region" text DEFAULT 'West Africa' NOT NULL,
	"country" text DEFAULT 'NG' NOT NULL,
	"website" text,
	"email" text,
	"description" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_directory_outreach" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"directory_entry_id" integer NOT NULL,
	"outreach_status" text DEFAULT 'not_contacted' NOT NULL,
	"invite_id" integer,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"template_key" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"partner_type" text DEFAULT 'creator_partner' NOT NULL,
	"org_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"custom_message" text,
	"tier_preset" text DEFAULT 'pro' NOT NULL,
	"opened_at" timestamp with time zone,
	"signed_up_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_count" integer DEFAULT 1 NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "partner_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"invite_id" integer,
	"org_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"website" text,
	"partner_type" text DEFAULT 'creator_partner' NOT NULL,
	"tier" text DEFAULT 'pro' NOT NULL,
	"account_manager_name" text,
	"account_manager_email" text,
	"deal_value" numeric(12, 2),
	"deal_notes" text,
	"region" text DEFAULT 'Nigeria' NOT NULL,
	"country" text DEFAULT 'NG' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activity_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_oauth_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"platform" text NOT NULL,
	"app_id" text,
	"app_secret" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_link_id_affiliate_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_deals" ADD CONSTRAINT "brand_deals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deal_id_brand_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."brand_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_oauth_configs" ADD CONSTRAINT "platform_oauth_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_accounts_user_platform_idx" ON "platform_accounts" USING btree ("user_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_oauth_configs_user_platform_idx" ON "platform_oauth_configs" USING btree ("user_id","platform");