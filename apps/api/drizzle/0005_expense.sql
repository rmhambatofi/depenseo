CREATE TABLE `expense` (
	`id` binary(16) NOT NULL,
	`notebook_id` binary(16) NOT NULL,
	`amount` bigint NOT NULL,
	`currency` char(3) NOT NULL,
	`category_id` binary(16) NOT NULL,
	`spent_on` date NOT NULL,
	`note` varchar(500),
	`merchant` varchar(100),
	`source` varchar(16) NOT NULL DEFAULT 'manual',
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `expense_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expense_tag` (
	`id` binary(16) NOT NULL,
	`expense_id` binary(16) NOT NULL,
	`tag_id` binary(16) NOT NULL,
	CONSTRAINT `expense_tag_id` PRIMARY KEY(`id`),
	CONSTRAINT `expense_tag_uq` UNIQUE(`expense_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` binary(16) NOT NULL,
	`notebook_id` binary(16) NOT NULL,
	`name` varchar(50) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `tag_id` PRIMARY KEY(`id`),
	CONSTRAINT `tag_name_uq` UNIQUE(`notebook_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `expense` ADD CONSTRAINT `expense_notebook_id_notebook_id_fk` FOREIGN KEY (`notebook_id`) REFERENCES `notebook`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expense` ADD CONSTRAINT `expense_category_id_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expense_tag` ADD CONSTRAINT `expense_tag_expense_id_expense_id_fk` FOREIGN KEY (`expense_id`) REFERENCES `expense`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expense_tag` ADD CONSTRAINT `expense_tag_tag_id_tag_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tag` ADD CONSTRAINT `tag_notebook_id_notebook_id_fk` FOREIGN KEY (`notebook_id`) REFERENCES `notebook`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `expense_sync_idx` ON `expense` (`notebook_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `expense_date_idx` ON `expense` (`notebook_id`,`spent_on`,`id`);--> statement-breakpoint
CREATE INDEX `expense_category_idx` ON `expense` (`category_id`);--> statement-breakpoint
CREATE INDEX `expense_tag_tag_idx` ON `expense_tag` (`tag_id`);--> statement-breakpoint
CREATE INDEX `tag_sync_idx` ON `tag` (`notebook_id`,`updated_at`,`id`);