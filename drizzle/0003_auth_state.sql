CREATE TABLE "praamid_auth_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"verification_code" text,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "praamid_auth_state" ADD CONSTRAINT "praamid_auth_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: users with existing credentials are already connected.
INSERT INTO "praamid_auth_state" ("user_id", "status")
  SELECT "user_id", 'connected' FROM "praamid_credentials"
  ON CONFLICT DO NOTHING;