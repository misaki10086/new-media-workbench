ALTER TABLE `publish_tasks` ADD `browser_profile_id` integer REFERENCES browser_profiles(id);--> statement-breakpoint
ALTER TABLE `publish_tasks` ADD `current_step` text DEFAULT 'CREATED' NOT NULL;--> statement-breakpoint
ALTER TABLE `publish_tasks` ADD `waiting_reason` text;--> statement-breakpoint
ALTER TABLE `publish_tasks` ADD `last_completed_step` text;--> statement-breakpoint
ALTER TABLE `publish_tasks` ADD `error_code` text;--> statement-breakpoint
ALTER TABLE `publish_tasks` ADD `updated_at` text NOT NULL;