CREATE TABLE `rate_limit` (
	`bucket` binary(32) NOT NULL,
	`window_started_at` datetime(3) NOT NULL,
	`hits` int NOT NULL,
	CONSTRAINT `rate_limit_bucket` PRIMARY KEY(`bucket`)
);
--> statement-breakpoint
CREATE INDEX `rate_limit_window_idx` ON `rate_limit` (`window_started_at`);