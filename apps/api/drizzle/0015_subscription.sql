CREATE TABLE `subscription` (
	`id` binary(16) NOT NULL,
	`user_id` binary(16) NOT NULL,
	`store` varchar(16) NOT NULL,
	`purchase_key_hash` binary(32) NOT NULL,
	`product_code` varchar(64) NOT NULL,
	`status` varchar(16) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`verified_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `subscription_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_purchase_uq` UNIQUE(`store`,`purchase_key_hash`)
);
--> statement-breakpoint
ALTER TABLE `user` ADD `trial_ends_at` datetime(3);--> statement-breakpoint
ALTER TABLE `subscription` ADD CONSTRAINT `subscription_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `subscription_user_idx` ON `subscription` (`user_id`,`expires_at`);