CREATE TABLE `treasury_closing_task_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`action` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`performed_by` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `treasury_closing_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_closing_task_audit_task` ON `treasury_closing_task_audit` (`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `treasury_closing_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issue_key` text NOT NULL,
	`scope` text DEFAULT 'account' NOT NULL,
	`bank_account_id` integer,
	`issue_type` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`recommended_action` text NOT NULL,
	`priority` text DEFAULT 'high' NOT NULL,
	`affected_amount` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_user_id` integer,
	`assigned_name` text,
	`assigned_email` text,
	`source_active` integer DEFAULT true NOT NULL,
	`first_seen_date` text NOT NULL,
	`last_seen_date` text NOT NULL,
	`resolved_at` text,
	`resolved_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bank_account_id`) REFERENCES `treasury_bank_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `treasury_closing_tasks_issue_key_unique` ON `treasury_closing_tasks` (`issue_key`);--> statement-breakpoint
CREATE INDEX `idx_treasury_closing_tasks_status_priority` ON `treasury_closing_tasks` (`status`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_treasury_closing_tasks_account` ON `treasury_closing_tasks` (`bank_account_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_treasury_closing_tasks_assignee` ON `treasury_closing_tasks` (`assigned_user_id`,`status`);