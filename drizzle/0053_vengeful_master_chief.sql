CREATE TABLE `treasury_capacity_routing_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurrence_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`candidate_name` text NOT NULL,
	`candidate_email` text NOT NULL,
	`alert_type` text NOT NULL,
	`domain` text,
	`feedback` text NOT NULL,
	`reason_code` text NOT NULL,
	`note` text,
	`candidate_score` real,
	`performed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`occurrence_id`) REFERENCES `treasury_capacity_alert_occurrences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_treasury_capacity_routing_feedback_once` ON `treasury_capacity_routing_feedback` (`occurrence_id`,`user_id`,`performed_by`);--> statement-breakpoint
CREATE INDEX `idx_treasury_capacity_routing_feedback_user_context` ON `treasury_capacity_routing_feedback` (`user_id`,`domain`,`alert_type`);--> statement-breakpoint
CREATE INDEX `idx_treasury_capacity_routing_feedback_created` ON `treasury_capacity_routing_feedback` (`created_at`);--> statement-breakpoint
ALTER TABLE `treasury_capacity_routing_settings` ADD `feedback_learning_enabled` integer DEFAULT true NOT NULL;