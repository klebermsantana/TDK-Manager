CREATE TABLE `treasury_alert_assignment_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurrence_id` integer NOT NULL,
	`user_id` integer,
	`assigned_name` text NOT NULL,
	`assigned_email` text NOT NULL,
	`assignment_source` text NOT NULL,
	`assigned_by` text NOT NULL,
	`assigned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`unassigned_at` text,
	`unassigned_by` text,
	FOREIGN KEY (`occurrence_id`) REFERENCES `treasury_alert_occurrences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_alert_assignment_history_occurrence` ON `treasury_alert_assignment_history` (`occurrence_id`,`assigned_at`);--> statement-breakpoint
CREATE INDEX `idx_treasury_alert_assignment_history_user` ON `treasury_alert_assignment_history` (`user_id`,`unassigned_at`);--> statement-breakpoint
CREATE TABLE `treasury_alert_assignment_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alert_type` text NOT NULL,
	`assigned_user_id` integer,
	`assigned_name` text,
	`assigned_email` text,
	`active` integer DEFAULT true NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `treasury_alert_assignment_rules_alert_type_unique` ON `treasury_alert_assignment_rules` (`alert_type`);--> statement-breakpoint
CREATE INDEX `idx_treasury_alert_assignment_rule_type` ON `treasury_alert_assignment_rules` (`alert_type`,`active`);--> statement-breakpoint
ALTER TABLE `treasury_alert_occurrences` ADD `assigned_user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `treasury_alert_occurrences` ADD `assigned_name` text;--> statement-breakpoint
ALTER TABLE `treasury_alert_occurrences` ADD `assigned_email` text;--> statement-breakpoint
ALTER TABLE `treasury_alert_occurrences` ADD `assigned_at` text;--> statement-breakpoint
ALTER TABLE `treasury_alert_occurrences` ADD `assignment_source` text;--> statement-breakpoint
CREATE INDEX `idx_treasury_alert_occurrence_assignee` ON `treasury_alert_occurrences` (`assigned_user_id`,`status`);