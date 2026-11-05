ALTER TABLE `user` ADD `reminder_time` char(5) DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `daily_reminder_time` char(5);--> statement-breakpoint
ALTER TABLE `recurring_expense` ADD `remind_three_days_before` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_expense` ADD `remind_on_due_date` boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `occurrence_reminder_idx` ON `occurrence` (`status`,`due_date`);