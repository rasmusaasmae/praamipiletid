CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"ntfy_topic" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_ntfy_topic_unique" UNIQUE("ntfy_topic")
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: one settings row per existing user, carrying their ntfy_topic over.
INSERT INTO "user_settings" ("user_id", "ntfy_topic")
  SELECT "id", "ntfy_topic" FROM "user";--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_ntfy_topic_unique";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "ntfy_topic";