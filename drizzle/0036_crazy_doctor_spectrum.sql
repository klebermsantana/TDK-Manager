CREATE TABLE `treasury_bank_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`bank_name` text,
	`account_type` text DEFAULT 'checking' NOT NULL,
	`agency` text,
	`account_number` text,
	`opening_balance` real DEFAULT 0 NOT NULL,
	`opening_date` text NOT NULL,
	`current_balance` real DEFAULT 0 NOT NULL,
	`balance_date` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_bank_accounts_active` ON `treasury_bank_accounts` (`active`);--> statement-breakpoint
CREATE TABLE `treasury_movement_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movement_type` text NOT NULL,
	`movement_id` integer NOT NULL,
	`bank_account_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bank_account_id`) REFERENCES `treasury_bank_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_treasury_movement_account` ON `treasury_movement_accounts` (`movement_type`,`movement_id`);--> statement-breakpoint
CREATE INDEX `idx_treasury_movement_bank_account` ON `treasury_movement_accounts` (`bank_account_id`);