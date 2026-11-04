CREATE TABLE `spending_limit` (
	`id` binary(16) NOT NULL,
	`notebook_id` binary(16) NOT NULL,
	`category_id` binary(16),
	`category_key` binary(16) GENERATED ALWAYS AS (coalesce(`category_id`, 0x00000000000000000000000000000000)) STORED,
	`period_kind` varchar(8) NOT NULL,
	`start_day` tinyint NOT NULL,
	`amount` bigint,
	`currency` char(3) NOT NULL,
	`include_recurring` boolean NOT NULL DEFAULT true,
	`effective_date` date NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `spending_limit_id` PRIMARY KEY(`id`),
	CONSTRAINT `spending_limit_version_uq` UNIQUE(`notebook_id`,`category_key`,`effective_date`)
);
--> statement-breakpoint
ALTER TABLE `spending_limit` ADD CONSTRAINT `spending_limit_notebook_id_notebook_id_fk` FOREIGN KEY (`notebook_id`) REFERENCES `notebook`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `spending_limit` ADD CONSTRAINT `spending_limit_category_id_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `spending_limit_sync_idx` ON `spending_limit` (`notebook_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `spending_limit_category_idx` ON `spending_limit` (`category_id`);