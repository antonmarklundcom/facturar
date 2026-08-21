CREATE TABLE `login_throttle` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scope` enum('email','ip') NOT NULL,
	`identifier` varchar(190) NOT NULL,
	`failures` int NOT NULL DEFAULT 0,
	`last_failure_at` datetime NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `login_throttle_id` PRIMARY KEY(`id`),
	CONSTRAINT `login_throttle_scope_identifier_uq` UNIQUE(`scope`,`identifier`)
);
--> statement-breakpoint
CREATE INDEX `login_throttle_last_failure_idx` ON `login_throttle` (`last_failure_at`);