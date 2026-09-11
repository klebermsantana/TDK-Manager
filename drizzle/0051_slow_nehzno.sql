CREATE TABLE `treasury_capacity_alert_assignment_history` (
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
	FOREIGN KEY (`occurrence_id`) REFERENCES `treasury_capacity_alert_occurrences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_capacity_alert_assignment_occurrence` ON `treasury_capacity_alert_assignment_history` (`occurrence_id`,`assigned_at`);--> statement-breakpoint
CREATE INDEX `idx_treasury_capacity_alert_assignment_user` ON `treasury_capacity_alert_assignment_history` (`user_id`,`unassigned_at`);--> statement-breakpoint
ALTER TABLE `treasury_capacity_alert_occurrences` ADD `assigned_user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `treasury_capacity_alert_occurrences` ADD `assigned_name` text;--> statement-breakpoint
ALTER TABLE `treasury_capacity_alert_occurrences` ADD `assigned_email` text;--> statement-breakpoint
ALTER TABLE `treasury_capacity_alert_occurrences` ADD `assigned_at` text;--> statement-breakpoint
ALTER TABLE `treasury_capacity_alert_occurrences` ADD `assignment_source` text;--> statement-breakpoint
ALTER TABLE `treasury_capacity_alert_occurrences` ADD `preparation_due_at` text;--> statement-breakpoint
ALTER TABLE `treasury_capacity_alert_occurrences` ADD `prepared_by` text;--> statement-breakpoint
ALTER TABLE `treasury_capacity_alert_occurrences` ADD `prepared_at` text;--> statement-breakpoint
ALTER TABLE `treasury_capacity_alert_occurrences` ADD `preparation_note` text;--> statement-breakpoint
ALTER TABLE `treasury_capacity_alert_occurrences` ADD `preparation_escalated_at` text;--> statement-breakpoint
CREATE INDEX `idx_treasury_capacity_alert_assignee` ON `treasury_capacity_alert_occurrences` (`assigned_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_treasury_capacity_alert_preparation_due` ON `treasury_capacity_alert_occurrences` (`preparation_due_at`,`status`);--> statement-breakpoint
ALTER TABLE `treasury_capacity_alert_settings` ADD `preparation_lead_business_days` integer DEFAULT 1 NOT NULL;