CREATE TABLE `praamid_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`access_token_enc` text NOT NULL,
	`praamid_sub` text NOT NULL,
	`session_sid` text,
	`expires_at` integer NOT NULL,
	`captured_at` integer NOT NULL,
	`last_verified_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `praamid_credentials_expires_at_idx` ON `praamid_credentials` (`expires_at`);--> statement-breakpoint
CREATE TABLE `praamid_csrf_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `praamid_csrf_nonces_user_id_idx` ON `praamid_csrf_nonces` (`user_id`);