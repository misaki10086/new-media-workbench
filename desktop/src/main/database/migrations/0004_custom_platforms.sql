CREATE TABLE `custom_platforms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`creator_url` text NOT NULL,
	`login_url_pattern` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_platforms_key_unique` ON `custom_platforms` (`key`);