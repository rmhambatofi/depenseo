CREATE TABLE `occurrence` (
	`id` binary(16) NOT NULL,
	`notebook_id` binary(16) NOT NULL,
	`recurring_expense_id` binary(16) NOT NULL,
	`due_date` date NOT NULL,
	`status` varchar(7) NOT NULL,
	`amount` bigint,
	`expense_id` binary(16),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `occurrence_id` PRIMARY KEY(`id`),
	CONSTRAINT `occurrence_due_uq` UNIQUE(`recurring_expense_id`,`due_date`)
);
--> statement-breakpoint
CREATE TABLE `recurring_expense` (
	`id` binary(16) NOT NULL,
	`notebook_id` binary(16) NOT NULL,
	`name` varchar(100) NOT NULL,
	`amount` bigint NOT NULL,
	`currency` char(3) NOT NULL,
	`pricing` varchar(9) NOT NULL,
	`frequency` varchar(9) NOT NULL,
	`start_date` date NOT NULL,
	`category_id` binary(16) NOT NULL,
	`mode` varchar(7) NOT NULL,
	`generated_through` date NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `recurring_expense_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `occurrence` ADD CONSTRAINT `occurrence_notebook_id_notebook_id_fk` FOREIGN KEY (`notebook_id`) REFERENCES `notebook`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `occurrence` ADD CONSTRAINT `occurrence_recurring_expense_id_recurring_expense_id_fk` FOREIGN KEY (`recurring_expense_id`) REFERENCES `recurring_expense`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `occurrence` ADD CONSTRAINT `occurrence_expense_id_expense_id_fk` FOREIGN KEY (`expense_id`) REFERENCES `expense`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurring_expense` ADD CONSTRAINT `recurring_expense_notebook_id_notebook_id_fk` FOREIGN KEY (`notebook_id`) REFERENCES `notebook`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurring_expense` ADD CONSTRAINT `recurring_expense_category_id_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `occurrence_sync_idx` ON `occurrence` (`notebook_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `occurrence_upcoming_idx` ON `occurrence` (`notebook_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `occurrence_expense_idx` ON `occurrence` (`expense_id`);--> statement-breakpoint
CREATE INDEX `recurring_expense_sync_idx` ON `recurring_expense` (`notebook_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `recurring_expense_category_idx` ON `recurring_expense` (`category_id`);--> statement-breakpoint
CREATE INDEX `recurring_expense_horizon_idx` ON `recurring_expense` (`generated_through`);