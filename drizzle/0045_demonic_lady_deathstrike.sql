CREATE TABLE `treasury_alert_occurrence_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurrence_id` integer NOT NULL,
	`action` text NOT NULL,
	`performed_by` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`occurrence_id`) REFERENCES `treasury_alert_occurrences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_alert_occurrence_audit_occurrence` ON `treasury_alert_occurrence_audit` (`occurrence_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `treasury_alert_occurrences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alert_key` text NOT NULL,
	`alert_type` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`recommended_action` text NOT NULL,
	`bank_account_id` integer,
	`account_name` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`metric` real,
	`status` text DEFAULT 'active' NOT NULL,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`acknowledged_by` text,
	`acknowledged_at` text,
	`acknowledgement_note` text,
	`resolved_at` text,
	`resolution_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bank_account_id`) REFERENCES `treasury_bank_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_alert_occurrence_key_status` ON `treasury_alert_occurrences` (`alert_key`,`status`);--> statement-breakpoint
CREATE INDEX `idx_treasury_alert_occurrence_status_severity` ON `treasury_alert_occurrences` (`status`,`severity`);--> statement-breakpoint
CREATE INDEX `idx_treasury_alert_occurrence_first_seen` ON `treasury_alert_occurrences` (`first_seen_at`);