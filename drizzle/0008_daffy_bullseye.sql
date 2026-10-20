CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`admin_email` text NOT NULL,
	`request_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stores_request_id_unique` ON `stores` (`request_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_dining_tables` (
	`store_id` text DEFAULT 'main' NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`zone` text NOT NULL,
	`token` text NOT NULL,
	PRIMARY KEY(`store_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_dining_tables`("id", "name", "zone", "token") SELECT "id", "name", "zone", "token" FROM `dining_tables`;--> statement-breakpoint
DROP TABLE `dining_tables`;--> statement-breakpoint
ALTER TABLE `__new_dining_tables` RENAME TO `dining_tables`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `dining_tables_token_store_unique` ON `dining_tables` (`store_id`,`token`);--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`store_id` text DEFAULT 'main' NOT NULL,
	`id` text NOT NULL,
	`code` text NOT NULL,
	`table_id` text NOT NULL,
	`table_name` text NOT NULL,
	`dining_session_id` text,
	`customer_name` text DEFAULT '' NOT NULL,
	`client_token` text NOT NULL,
	`request_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`items` text NOT NULL,
	`total` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`paid_at` integer,
	`payment_method` text DEFAULT 'unknown' NOT NULL,
	`cancel_reason` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`store_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "code", "table_id", "table_name", "dining_session_id", "customer_name", "client_token", "request_key", "request_hash", "items", "total", "note", "status", "paid", "paid_at", "payment_method", "cancel_reason", "created_at", "updated_at") SELECT "id", "code", "table_id", "table_name", "dining_session_id", "customer_name", "client_token", "request_key", "request_hash", "items", "total", "note", "status", "paid", "paid_at", "payment_method", "cancel_reason", "created_at", "updated_at" FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_requestKey_store_unique` ON `orders` (`store_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `orders_dining_session` ON `orders` (`store_id`,`dining_session_id`);--> statement-breakpoint
CREATE INDEX `orders_created_at` ON `orders` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_paid_at` ON `orders` (`store_id`,`paid_at`);--> statement-breakpoint
CREATE TABLE `__new_staff_accounts` (
	`store_id` text DEFAULT 'main' NOT NULL,
	`id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`user_id` text,
	`role` text NOT NULL,
	`permissions_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_login_at` integer,
	PRIMARY KEY(`store_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_staff_accounts`("id", "email", "name", "user_id", "role", "permissions_json", "status", "version", "created_at", "updated_at", "last_login_at") SELECT "id", "email", "name", "user_id", "role", "permissions_json", "status", "version", "created_at", "updated_at", "last_login_at" FROM `staff_accounts`;--> statement-breakpoint
DROP TABLE `staff_accounts`;--> statement-breakpoint
ALTER TABLE `__new_staff_accounts` RENAME TO `staff_accounts`;--> statement-breakpoint
CREATE UNIQUE INDEX `staff_accounts_email_store_unique` ON `staff_accounts` (`store_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `staff_accounts_userId_store_unique` ON `staff_accounts` (`store_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `staff_accounts_status_created` ON `staff_accounts` (`store_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_table_payment_receipts` (
	`store_id` text DEFAULT 'main' NOT NULL,
	`id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`session_id` text NOT NULL,
	`table_id` text NOT NULL,
	`table_name` text NOT NULL,
	`customer_name` text NOT NULL,
	`order_ids_json` text NOT NULL,
	`order_count` integer NOT NULL,
	`amount` integer NOT NULL,
	`payment_method` text NOT NULL,
	`paid_at` integer NOT NULL,
	PRIMARY KEY(`store_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_table_payment_receipts`("id", "request_id", "request_hash", "session_id", "table_id", "table_name", "customer_name", "order_ids_json", "order_count", "amount", "payment_method", "paid_at") SELECT "id", "request_id", "request_hash", "session_id", "table_id", "table_name", "customer_name", "order_ids_json", "order_count", "amount", "payment_method", "paid_at" FROM `table_payment_receipts`;--> statement-breakpoint
DROP TABLE `table_payment_receipts`;--> statement-breakpoint
ALTER TABLE `__new_table_payment_receipts` RENAME TO `table_payment_receipts`;--> statement-breakpoint
CREATE UNIQUE INDEX `table_payment_receipts_requestId_store_unique` ON `table_payment_receipts` (`store_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `table_payment_receipts_session_paid` ON `table_payment_receipts` (`store_id`,`session_id`,`paid_at`);--> statement-breakpoint
CREATE TABLE `__new_table_transfers` (
	`store_id` text DEFAULT 'main' NOT NULL,
	`id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`session_id` text NOT NULL,
	`from_table_id` text NOT NULL,
	`from_table_name` text NOT NULL,
	`to_table_id` text NOT NULL,
	`to_table_name` text NOT NULL,
	`transferred_at` integer NOT NULL,
	PRIMARY KEY(`store_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_table_transfers`("id", "request_id", "request_hash", "session_id", "from_table_id", "from_table_name", "to_table_id", "to_table_name", "transferred_at") SELECT "id", "request_id", "request_hash", "session_id", "from_table_id", "from_table_name", "to_table_id", "to_table_name", "transferred_at" FROM `table_transfers`;--> statement-breakpoint
DROP TABLE `table_transfers`;--> statement-breakpoint
ALTER TABLE `__new_table_transfers` RENAME TO `table_transfers`;--> statement-breakpoint
CREATE UNIQUE INDEX `table_transfers_requestId_store_unique` ON `table_transfers` (`store_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `table_transfers_session_time` ON `table_transfers` (`store_id`,`session_id`,`transferred_at`);--> statement-breakpoint
CREATE TABLE `__new_staff_account_audit` (
	`store_id` text DEFAULT 'main' NOT NULL,
	`id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`account_id` text NOT NULL,
	`account_email` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`store_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_staff_account_audit`("id", "actor_id", "actor_email", "account_id", "account_email", "action", "before_json", "after_json", "created_at") SELECT "id", "actor_id", "actor_email", "account_id", "account_email", "action", "before_json", "after_json", "created_at" FROM `staff_account_audit`;--> statement-breakpoint
DROP TABLE `staff_account_audit`;--> statement-breakpoint
ALTER TABLE `__new_staff_account_audit` RENAME TO `staff_account_audit`;--> statement-breakpoint
CREATE INDEX `staff_account_audit_created` ON `staff_account_audit` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `staff_account_audit_account_created` ON `staff_account_audit` (`store_id`,`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_table_sessions` (
	`store_id` text DEFAULT 'main' NOT NULL,
	`id` text NOT NULL,
	`table_id` text NOT NULL,
	`table_name` text NOT NULL,
	`browser_hash` text NOT NULL,
	`customer_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer,
	PRIMARY KEY(`store_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_table_sessions`("id", "table_id", "table_name", "browser_hash", "customer_name", "status", "created_at", "updated_at", "closed_at") SELECT "id", "table_id", "table_name", "browser_hash", "customer_name", "status", "created_at", "updated_at", "closed_at" FROM `table_sessions`;--> statement-breakpoint
DROP TABLE `table_sessions`;--> statement-breakpoint
ALTER TABLE `__new_table_sessions` RENAME TO `table_sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `one_live_session_per_table` ON `table_sessions` (`store_id`,`table_id`) WHERE "table_sessions"."status" IN ('pending','active');--> statement-breakpoint
CREATE INDEX `table_sessions_browser_created` ON `table_sessions` (`store_id`,`browser_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `table_sessions_closed_at` ON `table_sessions` (`store_id`,`closed_at`);--> statement-breakpoint
CREATE TABLE `__new_table_settlements` (
	`store_id` text DEFAULT 'main' NOT NULL,
	`session_id` text NOT NULL,
	`table_id` text NOT NULL,
	`table_name` text NOT NULL,
	`customer_name` text NOT NULL,
	`opened_at` integer NOT NULL,
	`closed_at` integer NOT NULL,
	`order_count` integer NOT NULL,
	`valid_order_count` integer NOT NULL,
	`cancelled_count` integer NOT NULL,
	`total` integer NOT NULL,
	`paid_total` integer NOT NULL,
	`cancelled_total` integer NOT NULL,
	`orders_json` text NOT NULL,
	PRIMARY KEY(`store_id`, `session_id`)
);
--> statement-breakpoint
INSERT INTO `__new_table_settlements`("session_id", "table_id", "table_name", "customer_name", "opened_at", "closed_at", "order_count", "valid_order_count", "cancelled_count", "total", "paid_total", "cancelled_total", "orders_json") SELECT "session_id", "table_id", "table_name", "customer_name", "opened_at", "closed_at", "order_count", "valid_order_count", "cancelled_count", "total", "paid_total", "cancelled_total", "orders_json" FROM `table_settlements`;--> statement-breakpoint
DROP TABLE `table_settlements`;--> statement-breakpoint
ALTER TABLE `__new_table_settlements` RENAME TO `table_settlements`;--> statement-breakpoint
CREATE INDEX `table_settlements_closed_at` ON `table_settlements` (`store_id`,`closed_at`);--> statement-breakpoint
CREATE INDEX `table_settlements_table_closed` ON `table_settlements` (`store_id`,`table_id`,`closed_at`);--> statement-breakpoint
CREATE TABLE `__new_menu_items` (
	`store_id` text DEFAULT 'main' NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`price` integer NOT NULL,
	`image` text NOT NULL,
	`badge` text DEFAULT '' NOT NULL,
	`available` integer DEFAULT 1 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`store_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_menu_items`("id", "name", "description", "category", "price", "image", "badge", "available", "sort") SELECT "id", "name", "description", "category", "price", "image", "badge", "available", "sort" FROM `menu_items`;--> statement-breakpoint
DROP TABLE `menu_items`;--> statement-breakpoint
ALTER TABLE `__new_menu_items` RENAME TO `menu_items`;--> statement-breakpoint
CREATE TABLE `__new_service_requests` (
	`store_id` text DEFAULT 'main' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`id` text NOT NULL,
	`table_id` text NOT NULL,
	`table_name` text NOT NULL,
	`session_id` text,
	`kind` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`store_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_service_requests`("note", "id", "table_id", "table_name", "session_id", "kind", "status", "created_at") SELECT "note", "id", "table_id", "table_name", "session_id", "kind", "status", "created_at" FROM `service_requests`;--> statement-breakpoint
DROP TABLE `service_requests`;--> statement-breakpoint
ALTER TABLE `__new_service_requests` RENAME TO `service_requests`;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`store_id` text DEFAULT 'main' NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`store_id`, `key`)
);
--> statement-breakpoint
INSERT INTO `__new_settings`("key", "value") SELECT "key", "value" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;