CREATE TABLE `table_payment_receipts` (
	`id` text PRIMARY KEY NOT NULL,
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
	`paid_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `table_payment_receipts_request_id_unique` ON `table_payment_receipts` (`request_id`);--> statement-breakpoint
CREATE INDEX `table_payment_receipts_session_paid` ON `table_payment_receipts` (`session_id`,`paid_at`);