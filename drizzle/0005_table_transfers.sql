CREATE TABLE `table_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`session_id` text NOT NULL,
	`from_table_id` text NOT NULL,
	`from_table_name` text NOT NULL,
	`to_table_id` text NOT NULL,
	`to_table_name` text NOT NULL,
	`transferred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `table_transfers_request_id_unique` ON `table_transfers` (`request_id`);--> statement-breakpoint
CREATE INDEX `table_transfers_session_time` ON `table_transfers` (`session_id`,`transferred_at`);