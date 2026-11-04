-- Ajout manuel (ADR-015) : collation par défaut de la base, héritée par toutes les tables.
-- Les bases mutualisées (cPanel) sont souvent créées en latin1 ou utf8mb4_general_ci.
ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci;
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` binary(16) NOT NULL,
	`actor_user_id` binary(16),
	`action` varchar(64) NOT NULL,
	`target_type` varchar(32),
	`target_id` binary(16),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_token` (
	`id` binary(16) NOT NULL,
	`user_id` binary(16) NOT NULL,
	`purpose` varchar(16) NOT NULL,
	`token_hash` binary(32) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`consumed_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `email_token_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_token_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `refresh_token` (
	`id` binary(16) NOT NULL,
	`user_id` binary(16) NOT NULL,
	`family_id` binary(16) NOT NULL,
	`token_hash` binary(32) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `refresh_token_id` PRIMARY KEY(`id`),
	CONSTRAINT `refresh_token_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `job` (
	`id` binary(16) NOT NULL,
	`type` varchar(64) NOT NULL,
	`payload` text NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`run_at` datetime(3) NOT NULL,
	`attempts` int unsigned NOT NULL DEFAULT 0,
	`unique_key` varchar(191),
	`locked_until` datetime(3),
	`last_error` varchar(255),
	`finished_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `job_id` PRIMARY KEY(`id`),
	CONSTRAINT `job_unique_key_uq` UNIQUE(`unique_key`)
);
--> statement-breakpoint
CREATE TABLE `notebook` (
	`id` binary(16) NOT NULL,
	`name` varchar(100) NOT NULL,
	`kind` varchar(16) NOT NULL DEFAULT 'personal',
	`owner_id` binary(16) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `notebook_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notebook_member` (
	`id` binary(16) NOT NULL,
	`notebook_id` binary(16) NOT NULL,
	`user_id` binary(16) NOT NULL,
	`role` varchar(16) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `notebook_member_id` PRIMARY KEY(`id`),
	CONSTRAINT `notebook_member_uq` UNIQUE(`notebook_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` binary(16) NOT NULL,
	`email` varchar(254) NOT NULL,
	`email_verified_at` datetime(3),
	`password_hash` varchar(255),
	`language` varchar(8) NOT NULL DEFAULT 'fr',
	`time_zone` varchar(64) NOT NULL DEFAULT 'Europe/Paris',
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`plan` varchar(16) NOT NULL DEFAULT 'free',
	`role` varchar(16) NOT NULL DEFAULT 'user',
	`admin_totp_secret` varchar(255),
	`terms_accepted_at` datetime(3),
	`privacy_accepted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `email_token` ADD CONSTRAINT `email_token_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refresh_token` ADD CONSTRAINT `refresh_token_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notebook` ADD CONSTRAINT `notebook_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notebook_member` ADD CONSTRAINT `notebook_member_notebook_id_notebook_id_fk` FOREIGN KEY (`notebook_id`) REFERENCES `notebook`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notebook_member` ADD CONSTRAINT `notebook_member_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_token_user_idx` ON `email_token` (`user_id`,`purpose`);--> statement-breakpoint
CREATE INDEX `refresh_token_family_idx` ON `refresh_token` (`family_id`);--> statement-breakpoint
CREATE INDEX `refresh_token_user_idx` ON `refresh_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `job_status_run_idx` ON `job` (`status`,`run_at`);--> statement-breakpoint
CREATE INDEX `notebook_owner_idx` ON `notebook` (`owner_id`);--> statement-breakpoint
CREATE INDEX `notebook_member_sync_idx` ON `notebook_member` (`notebook_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `notebook_member_user_idx` ON `notebook_member` (`user_id`);