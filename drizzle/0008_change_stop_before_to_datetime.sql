PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_trip_options` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`priority` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`event_uid` text NOT NULL,
	`event_date` text NOT NULL,
	`event_dtstart` integer NOT NULL,
	`stop_before_at` integer NOT NULL,
	`last_capacity` integer,
	`last_capacity_state` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_trip_options`("id","trip_id","priority","active","event_uid","event_date","event_dtstart","stop_before_at","last_capacity","last_capacity_state","created_at","updated_at")
SELECT "id","trip_id","priority","active","event_uid","event_date","event_dtstart",
       (`event_dtstart` - `stop_before_minutes` * 60000) AS "stop_before_at",
       "last_capacity","last_capacity_state","created_at","updated_at"
FROM `trip_options`;--> statement-breakpoint
DROP TABLE `trip_options`;--> statement-breakpoint
ALTER TABLE `__new_trip_options` RENAME TO `trip_options`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `trip_options_event_unique` ON `trip_options` (`trip_id`,`event_uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `trip_options_priority_unique` ON `trip_options` (`trip_id`,`priority`);--> statement-breakpoint
CREATE INDEX `trip_options_dtstart_idx` ON `trip_options` (`event_dtstart`);
