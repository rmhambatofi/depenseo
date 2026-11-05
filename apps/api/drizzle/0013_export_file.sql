CREATE TABLE `export_file` (
	`id` binary(16) NOT NULL,
	`notebook_id` binary(16) NOT NULL,
	`user_id` binary(16) NOT NULL,
	`format` varchar(8) NOT NULL,
	`date_from` date NOT NULL,
	`date_to` date NOT NULL,
	`status` varchar(16) NOT NULL,
	`expires_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `export_file_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `export_file` ADD CONSTRAINT `export_file_notebook_id_notebook_id_fk` FOREIGN KEY (`notebook_id`) REFERENCES `notebook`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `export_file` ADD CONSTRAINT `export_file_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `export_file_sync_idx` ON `export_file` (`notebook_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `export_file_user_idx` ON `export_file` (`user_id`);--> statement-breakpoint
CREATE INDEX `export_file_purge_idx` ON `export_file` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `export_file_created_idx` ON `export_file` (`created_at`);