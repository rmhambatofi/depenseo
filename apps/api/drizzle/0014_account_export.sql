CREATE TABLE `account_export` (
	`id` binary(16) NOT NULL,
	`user_id` binary(16) NOT NULL,
	`status` varchar(16) NOT NULL,
	`expires_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `account_export_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `account_export` ADD CONSTRAINT `account_export_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_export_user_idx` ON `account_export` (`user_id`);--> statement-breakpoint
CREATE INDEX `account_export_purge_idx` ON `account_export` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `account_export_created_idx` ON `account_export` (`created_at`);