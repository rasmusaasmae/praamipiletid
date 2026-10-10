CREATE TABLE "praamid_auth_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'unauthenticated' NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "praamid_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"praamid_sub" text NOT NULL,
	"session_sid" text,
	"expires_at" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_options" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"priority" integer NOT NULL,
	"event_uid" text NOT NULL,
	"event_date" text NOT NULL,
	"event_dtstart" timestamp with time zone NOT NULL,
	"stop_before_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_syncs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" integer PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"booking_uid" text NOT NULL,
	"booking_reference_number" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"ticket_code" text NOT NULL,
	"ticket_number" text NOT NULL,
	"direction" text NOT NULL,
	"measurement_unit" text NOT NULL,
	"event_uid" text NOT NULL,
	"event_dtstart" timestamp with time zone NOT NULL,
	"ticket_date" text NOT NULL,
	"parent_ticket_id" integer,
	"next_swap_at" timestamp with time zone,
	"captured_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "praamid_auth_state" ADD CONSTRAINT "praamid_auth_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "praamid_credentials" ADD CONSTRAINT "praamid_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_options" ADD CONSTRAINT "ticket_options_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_syncs" ADD CONSTRAINT "ticket_syncs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "praamid_credentials_expires_at_idx" ON "praamid_credentials" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_options_event_unique" ON "ticket_options" USING btree ("ticket_id","event_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_options_priority_unique" ON "ticket_options" USING btree ("ticket_id","priority");--> statement-breakpoint
CREATE INDEX "ticket_options_dtstart_idx" ON "ticket_options" USING btree ("event_dtstart");--> statement-breakpoint
CREATE INDEX "tickets_user_id_idx" ON "tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tickets_booking_uid_idx" ON "tickets" USING btree ("booking_uid");--> statement-breakpoint
CREATE INDEX "tickets_parent_ticket_id_idx" ON "tickets" USING btree ("parent_ticket_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");