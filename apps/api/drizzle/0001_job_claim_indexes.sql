CREATE INDEX `job_status_locked_idx` ON `job` (`status`,`locked_until`);--> statement-breakpoint
CREATE INDEX `job_status_finished_idx` ON `job` (`status`,`finished_at`);