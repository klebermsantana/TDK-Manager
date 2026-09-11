CREATE TABLE `treasury_financial_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movement_type` text NOT NULL,
	`movement_id` integer NOT NULL,
	`direction` text NOT NULL,
	`event_type` text NOT NULL,
	`amount` real NOT NULL,
	`event_date` text NOT NULL,
	`source` text NOT NULL,
	`source_key` text NOT NULL,
	`bank_account_id` integer,
	`statement_transaction_id` integer,
	`performed_by` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bank_account_id`) REFERENCES `treasury_bank_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`statement_transaction_id`) REFERENCES `treasury_statement_transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_treasury_financial_event_source` ON `treasury_financial_events` (`source_key`);--> statement-breakpoint
CREATE INDEX `idx_treasury_financial_event_movement_date` ON `treasury_financial_events` (`movement_type`,`movement_id`,`event_date`);--> statement-breakpoint
CREATE INDEX `idx_treasury_financial_event_account_date` ON `treasury_financial_events` (`bank_account_id`,`event_date`);--> statement-breakpoint
CREATE INDEX `idx_treasury_financial_event_statement` ON `treasury_financial_events` (`statement_transaction_id`);