ALTER TABLE `publish_tasks` ADD `priority` text DEFAULT 'NORMAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `publish_tasks` ADD `max_retries` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `publish_tasks` ADD `next_retry_at` text;