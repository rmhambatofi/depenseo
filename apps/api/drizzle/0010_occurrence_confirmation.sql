ALTER TABLE `occurrence` ADD `confirmation_requested_at` datetime(3);--> statement-breakpoint
CREATE INDEX `occurrence_due_idx` ON `occurrence` (`status`,`confirmation_requested_at`,`due_date`);