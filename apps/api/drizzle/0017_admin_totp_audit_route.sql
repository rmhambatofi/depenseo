ALTER TABLE `audit_log` ADD `route` varchar(160);--> statement-breakpoint
ALTER TABLE `user` ADD `admin_totp_last_step` bigint;