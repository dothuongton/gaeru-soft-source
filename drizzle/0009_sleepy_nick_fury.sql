ALTER TABLE `stores` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `source` text DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `owner_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `updated_by` text DEFAULT '' NOT NULL;