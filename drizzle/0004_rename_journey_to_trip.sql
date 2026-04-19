-- Rename journeys → trips
DROP INDEX IF EXISTS `journeys_user_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `journeys_active_idx`;--> statement-breakpoint
ALTER TABLE `journeys` RENAME TO `trips`;--> statement-breakpoint
CREATE INDEX `trips_user_id_idx` ON `trips` (`user_id`);--> statement-breakpoint
CREATE INDEX `trips_active_idx` ON `trips` (`active`);--> statement-breakpoint

-- Rename journey_options → trip_options and its FK column
DROP INDEX IF EXISTS `journey_options_event_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `journey_options_priority_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `journey_options_dtstart_idx`;--> statement-breakpoint
ALTER TABLE `journey_options` RENAME TO `trip_options`;--> statement-breakpoint
ALTER TABLE `trip_options` RENAME COLUMN `journey_id` TO `trip_id`;--> statement-breakpoint
CREATE UNIQUE INDEX `trip_options_event_unique` ON `trip_options` (`trip_id`,`event_uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `trip_options_priority_unique` ON `trip_options` (`trip_id`,`priority`);--> statement-breakpoint
CREATE INDEX `trip_options_dtstart_idx` ON `trip_options` (`event_dtstart`);--> statement-breakpoint

-- Tickets: rename FK column (FK target auto-updated by SQLite when journeys was renamed)
ALTER TABLE `tickets` RENAME COLUMN `journey_id` TO `trip_id`;--> statement-breakpoint

-- Audit logs: rename FK column and index
DROP INDEX IF EXISTS `audit_logs_journey_idx`;--> statement-breakpoint
ALTER TABLE `audit_logs` RENAME COLUMN `journey_id` TO `trip_id`;--> statement-breakpoint
CREATE INDEX `audit_logs_trip_idx` ON `audit_logs` (`trip_id`);
