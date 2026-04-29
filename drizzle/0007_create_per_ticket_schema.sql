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
	"swap_in_progress" boolean DEFAULT false NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_options" ADD CONSTRAINT "ticket_options_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_options_event_unique" ON "ticket_options" USING btree ("ticket_id","event_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_options_priority_unique" ON "ticket_options" USING btree ("ticket_id","priority");--> statement-breakpoint
CREATE INDEX "ticket_options_dtstart_idx" ON "ticket_options" USING btree ("event_dtstart");--> statement-breakpoint
CREATE INDEX "tickets_user_id_idx" ON "tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tickets_booking_uid_idx" ON "tickets" USING btree ("booking_uid");--> statement-breakpoint
CREATE INDEX "tickets_parent_ticket_id_idx" ON "tickets" USING btree ("parent_ticket_id");