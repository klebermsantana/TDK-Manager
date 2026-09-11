CREATE TABLE `treasury_reconciliation_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`statement_transaction_id` integer NOT NULL,
	`bank_account_id` integer NOT NULL,
	`movement_type` text NOT NULL,
	`movement_id` integer NOT NULL,
	`allocated_amount` real NOT NULL,
	`matched_by` text NOT NULL,
	`matched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`statement_transaction_id`) REFERENCES `treasury_statement_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bank_account_id`) REFERENCES `treasury_bank_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_treasury_reconciliation_allocation_pair` ON `treasury_reconciliation_allocations` (`statement_transaction_id`,`movement_type`,`movement_id`);--> statement-breakpoint
CREATE INDEX `idx_treasury_reconciliation_allocation_transaction` ON `treasury_reconciliation_allocations` (`statement_transaction_id`);--> statement-breakpoint
CREATE INDEX `idx_treasury_reconciliation_allocation_movement` ON `treasury_reconciliation_allocations` (`movement_type`,`movement_id`);--> statement-breakpoint
CREATE INDEX `idx_treasury_reconciliation_allocation_account` ON `treasury_reconciliation_allocations` (`bank_account_id`,`created_at`);--> statement-breakpoint
DROP INDEX `uq_treasury_active_settlement_transaction`;--> statement-breakpoint
DROP INDEX `uq_treasury_active_settlement_movement`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_treasury_active_settlement_pair` ON `treasury_reconciliation_settlements` (`statement_transaction_id`,`movement_type`,`movement_id`);--> statement-breakpoint
CREATE INDEX `idx_treasury_active_settlement_transaction` ON `treasury_reconciliation_settlements` (`statement_transaction_id`);--> statement-breakpoint
CREATE INDEX `idx_treasury_active_settlement_movement` ON `treasury_reconciliation_settlements` (`movement_type`,`movement_id`);--> statement-breakpoint
DROP INDEX `uq_treasury_statement_matched_movement`;--> statement-breakpoint
CREATE INDEX `idx_treasury_statement_legacy_match` ON `treasury_statement_transactions` (`matched_movement_type`,`matched_movement_id`);