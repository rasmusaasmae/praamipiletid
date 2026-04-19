CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`actor` text NOT NULL,
	`type` text NOT NULL,
	`journey_id` text,
	`payload` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_user_created_idx` ON `audit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_type_idx` ON `audit_logs` (`type`);--> statement-breakpoint
CREATE INDEX `audit_logs_journey_idx` ON `audit_logs` (`journey_id`);--> statement-breakpoint
CREATE TABLE `journey_options` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`priority` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`event_uid` text NOT NULL,
	`event_date` text NOT NULL,
	`event_dtstart` integer NOT NULL,
	`last_capacity` integer,
	`last_capacity_state` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journey_options_event_unique` ON `journey_options` (`journey_id`,`event_uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `journey_options_priority_unique` ON `journey_options` (`journey_id`,`priority`);--> statement-breakpoint
CREATE INDEX `journey_options_dtstart_idx` ON `journey_options` (`event_dtstart`);--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`direction` text NOT NULL,
	`measurement_unit` text NOT NULL,
	`threshold` integer DEFAULT 1 NOT NULL,
	`notify` integer DEFAULT true NOT NULL,
	`edit` integer DEFAULT false NOT NULL,
	`stop_before_minutes` integer DEFAULT 60 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `journeys_user_id_idx` ON `journeys` (`user_id`);--> statement-breakpoint
CREATE INDEX `journeys_active_idx` ON `journeys` (`active`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`journey_id` text PRIMARY KEY NOT NULL,
	`ticket_code` text NOT NULL,
	`ticket_number` text NOT NULL,
	`booking_uid` text NOT NULL,
	`event_uid` text NOT NULL,
	`ticket_date` text NOT NULL,
	`event_dtstart` integer NOT NULL,
	`captured_at` integer NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tickets_event_uid_idx` ON `tickets` (`event_uid`);--> statement-breakpoint
INSERT INTO `journeys` (`id`, `user_id`, `direction`, `measurement_unit`, `threshold`, `notify`, `edit`, `stop_before_minutes`, `active`, `created_at`, `updated_at`)
SELECT `id`, `user_id`, `direction`, `capacity_type`, `threshold`, 1, 0, 60, `active`, `created_at`, `updated_at`
FROM `subscriptions`;--> statement-breakpoint
INSERT INTO `journey_options` (`id`, `journey_id`, `priority`, `active`, `event_uid`, `event_date`, `event_dtstart`, `last_capacity`, `last_capacity_state`, `created_at`, `updated_at`)
SELECT
  lower(hex(randomblob(16))),
  `id`,
  1,
  1,
  `trip_uid`,
  `date`,
  `departure_at`,
  `last_capacity`,
  CASE
    WHEN `last_capacity` IS NULL THEN NULL
    WHEN `last_capacity` >= `threshold` THEN 'above'
    ELSE 'below'
  END,
  `created_at`,
  `updated_at`
FROM `subscriptions`;