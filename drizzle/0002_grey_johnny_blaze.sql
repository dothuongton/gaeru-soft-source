ALTER TABLE `orders` ADD `paid_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_method` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
CREATE INDEX `orders_created_at` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_paid_at` ON `orders` (`paid_at`);