ALTER TABLE "trip_options" ADD COLUMN "last_capacity_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "swap_in_progress" boolean DEFAULT false NOT NULL;