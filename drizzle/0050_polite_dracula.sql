CREATE TABLE `treasury_capacity_alert_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurrence_id` integer NOT NULL,
	`action` text NOT NULL,
	`performed_by` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`occurrence_id`) REFERENCES `treasury_capacity_alert_occurrences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_capacity_alert_audit_occurrence` ON `treasury_capacity_alert_audit` (`occurrence_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `treasury_capacity_alert_occurrences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alert_key` text NOT NULL,
	`alert_type` text NOT NULL,
	`severity` text NOT NULL,
	`risk_date` text NOT NULL,
	`domain` text,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`recommended_action` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`acknowledged_by` text,
	`acknowledged_at` text,
	`acknowledgement_note` text,
	`resolved_at` text,
	`resolution_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_capacity_alert_key_status` ON `treasury_capacity_alert_occurrences` (`alert_key`,`status`);--> statement-breakpoint
CREATE INDEX `idx_treasury_capacity_alert_status_severity` ON `treasury_capacity_alert_occurrences` (`status`,`severity`);--> statement-breakpoint
CREATE INDEX `idx_treasury_capacity_alert_risk_date` ON `treasury_capacity_alert_occurrences` (`risk_date`,`status`);--> statement-breakpoint
CREATE TABLE `treasury_capacity_alert_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`lookahead_days` integer DEFAULT 7 NOT NULL,
	`low_capacity_threshold_pct` real DEFAULT 70 NOT NULL,
	`uncovered_enabled` integer DEFAULT true NOT NULL,
	`single_point_enabled` integer DEFAULT true NOT NULL,
	`absence_without_coverage_enabled` integer DEFAULT true NOT NULL,
	`low_capacity_enabled` integer DEFAULT true NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
