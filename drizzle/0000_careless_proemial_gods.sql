CREATE TABLE `dining_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`zone` text NOT NULL,
	`token` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dining_tables_token_unique` ON `dining_tables` (`token`);--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`price` integer NOT NULL,
	`image` text NOT NULL,
	`badge` text DEFAULT '' NOT NULL,
	`available` integer DEFAULT 1 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`table_id` text NOT NULL,
	`table_name` text NOT NULL,
	`client_token` text NOT NULL,
	`request_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`items` text NOT NULL,
	`total` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`cancel_reason` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_request_key_unique` ON `orders` (`request_key`);--> statement-breakpoint
CREATE TABLE `service_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`table_name` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
