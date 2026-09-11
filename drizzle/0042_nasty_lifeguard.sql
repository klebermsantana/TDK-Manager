CREATE TABLE `treasury_closing_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`closing_id` integer NOT NULL,
	`bank_account_id` integer NOT NULL,
	`closing_date` text NOT NULL,
	`action` text NOT NULL,
	`performed_by` text NOT NULL,
	`reason` text,
	`snapshot_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`closing_id`) REFERENCES `treasury_closing_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bank_account_id`) REFERENCES `treasury_bank_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_closing_audit_closing` ON `treasury_closing_audit` (`closing_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_treasury_closing_audit_account` ON `treasury_closing_audit` (`bank_account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `treasury_closing_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bank_account_id` integer NOT NULL,
	`closing_date` text NOT NULL,
	`status` text DEFAULT 'closed' NOT NULL,
	`base_balance` real NOT NULL,
	`ledger_net` real NOT NULL,
	`book_balance` real NOT NULL,
	`statement_net` real NOT NULL,
	`statement_balance` real NOT NULL,
	`closing_difference` real DEFAULT 0 NOT NULL,
	`reconciliation_coverage` real DEFAULT 100 NOT NULL,
	`unallocated_amount` real DEFAULT 0 NOT NULL,
	`ledger_event_count` integer DEFAULT 0 NOT NULL,
	`statement_transaction_count` integer DEFAULT 0 NOT NULL,
	`snapshot_source` text DEFAULT 'movement' NOT NULL,
	`notes` text,
	`closed_by` text NOT NULL,
	`closed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reopened_by` text,
	`reopened_at` text,
	`reopen_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bank_account_id`) REFERENCES `treasury_bank_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_closing_account_date` ON `treasury_closing_records` (`bank_account_id`,`closing_date`);--> statement-breakpoint
CREATE INDEX `idx_treasury_closing_status_date` ON `treasury_closing_records` (`status`,`closing_date`);