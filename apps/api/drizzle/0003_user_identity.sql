CREATE TABLE `user_identity` (
	`id` binary(16) NOT NULL,
	`user_id` binary(16) NOT NULL,
	`provider` varchar(16) NOT NULL,
	`subject_hash` binary(32) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `user_identity_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_identity_subject_uq` UNIQUE(`provider`,`subject_hash`)
);
--> statement-breakpoint
ALTER TABLE `user_identity` ADD CONSTRAINT `user_identity_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `user_identity_user_idx` ON `user_identity` (`user_id`);