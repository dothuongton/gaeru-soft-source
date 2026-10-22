CREATE TABLE `auth_credentials` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`must_change_password` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_credentials_user_id_unique` ON `auth_credentials` (`user_id`);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_email_idx` ON `auth_sessions` (`email`);
--> statement-breakpoint
CREATE INDEX `auth_sessions_expires_at_idx` ON `auth_sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_tokens_email_idx` ON `auth_tokens` (`email`);
--> statement-breakpoint
CREATE TABLE `auth_login_attempts` (
	`attempt_key` text PRIMARY KEY NOT NULL,
	`fail_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`action` text NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_audit_email_created_idx` ON `auth_audit` (`email`, `created_at`);
