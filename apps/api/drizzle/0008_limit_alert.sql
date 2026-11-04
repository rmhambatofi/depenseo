CREATE TABLE `limit_alert` (
	`id` binary(16) NOT NULL,
	`notebook_id` binary(16) NOT NULL,
	`period_start` date NOT NULL,
	`threshold` smallint unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `limit_alert_id` PRIMARY KEY(`id`),
	CONSTRAINT `limit_alert_period_uq` UNIQUE(`notebook_id`,`period_start`)
);
--> statement-breakpoint
ALTER TABLE `limit_alert` ADD CONSTRAINT `limit_alert_notebook_id_notebook_id_fk` FOREIGN KEY (`notebook_id`) REFERENCES `notebook`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `limit_alert_sync_idx` ON `limit_alert` (`notebook_id`,`updated_at`,`id`);