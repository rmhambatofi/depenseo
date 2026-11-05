CREATE TABLE `device` (
	`id` binary(16) NOT NULL,
	`user_id` binary(16) NOT NULL,
	`platform` varchar(8) NOT NULL,
	`push_token` varchar(512) NOT NULL,
	`push_token_hash` binary(32) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `device_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_push_token_uq` UNIQUE(`push_token_hash`)
);
--> statement-breakpoint
CREATE TABLE `notification_setting` (
	`id` binary(16) NOT NULL,
	`user_id` binary(16) NOT NULL,
	`limit_enabled` boolean NOT NULL DEFAULT true,
	`occurrence_enabled` boolean NOT NULL DEFAULT true,
	`unusual_expense_enabled` boolean NOT NULL DEFAULT true,
	`daily_reminder_enabled` boolean NOT NULL DEFAULT true,
	`quiet_start` char(5),
	`quiet_end` char(5),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `notification_setting_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_setting_user_uq` UNIQUE(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `device` ADD CONSTRAINT `device_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_setting` ADD CONSTRAINT `notification_setting_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `device_user_idx` ON `device` (`user_id`);