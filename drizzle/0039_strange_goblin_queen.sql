CREATE TABLE `treasury_reconciliation_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`statement_transaction_id` integer NOT NULL,
	`bank_account_id` integer NOT NULL,
	`movement_type` text NOT NULL,
	`movement_id` integer NOT NULL,
	`action` text NOT NULL,
	`amount` real NOT NULL,
	`previous_amount` real NOT NULL,
	`resulting_amount` real NOT NULL,
	`previous_status` text NOT NULL,
	`resulting_status` text NOT NULL,
	`payment_date` text NOT NULL,
	`performed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`statement_transaction_id`) REFERENCES `treasury_statement_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bank_account_id`) REFERENCES `treasury_bank_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_reconciliation_audit_transaction` ON `treasury_reconciliation_audit` (`statement_transaction_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_treasury_reconciliation_audit_movement` ON `treasury_reconciliation_audit` (`movement_type`,`movement_id`);--> statement-breakpoint
CREATE INDEX `idx_treasury_reconciliation_audit_account` ON `treasury_reconciliation_audit` (`bank_account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `treasury_reconciliation_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`statement_transaction_id` integer NOT NULL,
	`bank_account_id` integer NOT NULL,
	`movement_type` text NOT NULL,
	`movement_id` integer NOT NULL,
	`settlement_amount` real NOT NULL,
	`previous_amount` real NOT NULL,
	`resulting_amount` real NOT NULL,
	`previous_status` text NOT NULL,
	`resulting_status` text NOT NULL,
	`previous_payment_date` text,
	`payment_date` text NOT NULL,
	`settled_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`statement_transaction_id`) REFERENCES `treasury_statement_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bank_account_id`) REFERENCES `treasury_bank_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_treasury_active_settlement_transaction` ON `treasury_reconciliation_settlements` (`statement_transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_treasury_active_settlement_movement` ON `treasury_reconciliation_settlements` (`movement_type`,`movement_id`);--> statement-breakpoint
CREATE INDEX `idx_treasury_active_settlement_account` ON `treasury_reconciliation_settlements` (`bank_account_id`,`created_at`);