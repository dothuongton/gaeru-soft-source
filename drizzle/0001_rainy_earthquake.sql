CREATE TABLE `table_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`table_name` text NOT NULL,
	`browser_hash` text NOT NULL,
	`customer_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_live_session_per_table` ON `table_sessions` (`table_id`) WHERE "table_sessions"."status" IN ('pending','active');--> statement-breakpoint
CREATE INDEX `table_sessions_browser_created` ON `table_sessions` (`browser_hash`,`created_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `dining_session_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `orders_dining_session` ON `orders` (`dining_session_id`);--> statement-breakpoint
ALTER TABLE `service_requests` ADD `session_id` text;
--> statement-breakpoint
-- Preserve occupied tables from before browser ownership existed. These sessions
-- cannot be claimed by a guest; staff must finish the old work and close them.
INSERT INTO `table_sessions` (`id`,`table_id`,`table_name`,`browser_hash`,`customer_name`,`status`,`created_at`,`updated_at`,`closed_at`)
SELECT 'legacy-' || t.`id`,t.`id`,t.`name`,'','Khách trước khi cập nhật','active',
 CAST(strftime('%s','now') AS INTEGER) * 1000,CAST(strftime('%s','now') AS INTEGER) * 1000,NULL
FROM `dining_tables` t
WHERE EXISTS (SELECT 1 FROM `orders` o WHERE o.`table_id` = t.`id` AND o.`status` != 'cancelled' AND (o.`paid` = 0 OR o.`status` != 'served'))
 OR EXISTS (SELECT 1 FROM `service_requests` r WHERE r.`table_id` = t.`id` AND r.`status` = 'open');
--> statement-breakpoint
UPDATE `orders` SET `dining_session_id` = 'legacy-' || `table_id`,`customer_name` = 'Khách trước khi cập nhật'
WHERE `dining_session_id` IS NULL AND `status` != 'cancelled' AND (`paid` = 0 OR `status` != 'served')
 AND EXISTS (SELECT 1 FROM `table_sessions` s WHERE s.`id` = 'legacy-' || `orders`.`table_id`);
--> statement-breakpoint
UPDATE `service_requests` SET `session_id` = 'legacy-' || `table_id`
WHERE `status` = 'open' AND EXISTS (SELECT 1 FROM `table_sessions` s WHERE s.`id` = 'legacy-' || `service_requests`.`table_id`);
