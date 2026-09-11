CREATE TABLE `treasury_statement_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bank_account_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`file_type` text NOT NULL,
	`content_hash` text NOT NULL,
	`period_start` text,
	`period_end` text,
	`transaction_count` integer DEFAULT 0 NOT NULL,
	`imported_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bank_account_id`) REFERENCES `treasury_bank_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_treasury_statement_import_hash` ON `treasury_statement_imports` (`bank_account_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_treasury_statement_import_account` ON `treasury_statement_imports` (`bank_account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `treasury_statement_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`bank_account_id` integer NOT NULL,
	`external_id` text,
	`transaction_date` text NOT NULL,
	`amount` real NOT NULL,
	`description` text NOT NULL,
	`memo` text,
	`document` text,
	`balance` real,
	`matched_movement_type` text,
	`matched_movement_id` integer,
	`matched_at` text,
	`matched_by` text,
	`match_method` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `treasury_statement_imports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bank_account_id`) REFERENCES `treasury_bank_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_treasury_statement_external` ON `treasury_statement_transactions` (`import_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_treasury_statement_transaction_account_date` ON `treasury_statement_transactions` (`bank_account_id`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `idx_treasury_statement_transaction_match` ON `treasury_statement_transactions` (`matched_movement_type`,`matched_movement_id`);