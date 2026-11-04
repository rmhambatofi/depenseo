CREATE TABLE `category` (
	`id` binary(16) NOT NULL,
	`notebook_id` binary(16) NOT NULL,
	`parent_id` binary(16),
	`system_key` varchar(64),
	`name` varchar(100) NOT NULL,
	`icon` varchar(32) NOT NULL,
	`color` char(7) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`hidden` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `category_id` PRIMARY KEY(`id`),
	CONSTRAINT `category_system_key_uq` UNIQUE(`notebook_id`,`system_key`)
);
--> statement-breakpoint
ALTER TABLE `category` ADD CONSTRAINT `category_notebook_id_notebook_id_fk` FOREIGN KEY (`notebook_id`) REFERENCES `notebook`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `category` ADD CONSTRAINT `category_parent_id_category_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `category`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `category_sync_idx` ON `category` (`notebook_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `category_parent_idx` ON `category` (`parent_id`);