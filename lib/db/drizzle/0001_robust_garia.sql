CREATE TABLE "email_suppressions" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"event_type" text NOT NULL,
	"resend_email_id" text,
	"suppressed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD COLUMN "oauth_state_expires_at" timestamp with time zone;