CREATE TABLE `table_settlements` (
	`session_id` text PRIMARY KEY NOT NULL,
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
	`orders_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `table_settlements_closed_at` ON `table_settlements` (`closed_at`);--> statement-breakpoint
CREATE INDEX `table_settlements_table_closed` ON `table_settlements` (`table_id`,`closed_at`);--> statement-breakpoint
CREATE INDEX `table_sessions_closed_at` ON `table_sessions` (`closed_at`);