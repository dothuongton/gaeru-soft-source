CREATE TABLE `staff_account_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`account_id` text NOT NULL,
	`account_email` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `staff_account_audit_created` ON `staff_account_audit` (`created_at`);--> statement-breakpoint
CREATE INDEX `staff_account_audit_account_created` ON `staff_account_audit` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `staff_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`user_id` text,
	`role` text NOT NULL,
	`permissions_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_accounts_email_unique` ON `staff_accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `staff_accounts_user_id_unique` ON `staff_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `staff_accounts_status_created` ON `staff_accounts` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `staff_owner_bindings` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `staff_owner_bindings_user` ON `staff_owner_bindings` (`user_id`);