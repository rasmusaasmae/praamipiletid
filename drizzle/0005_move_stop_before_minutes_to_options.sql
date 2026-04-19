ALTER TABLE `trip_options` ADD `stop_before_minutes` integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` DROP COLUMN `stop_before_minutes`;