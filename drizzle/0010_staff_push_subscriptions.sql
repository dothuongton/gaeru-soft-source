CREATE TABLE `staff_push_subscriptions` (
	`store_id` text DEFAULT 'main' NOT NULL,
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`staff_account_id` text,
	`device_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`endpoint_hash` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	PRIMARY KEY(`store_id`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_push_user_device_store_unique` ON `staff_push_subscriptions` (`store_id`, `user_id`, `device_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_push_endpoint_hash_store_unique` ON `staff_push_subscriptions` (`store_id`, `endpoint_hash`);
--> statement-breakpoint
CREATE INDEX `staff_push_user_store` ON `staff_push_subscriptions` (`store_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX `staff_push_updated` ON `staff_push_subscriptions` (`store_id`, `updated_at`);
