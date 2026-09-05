CREATE TABLE `receivables` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`billing_id` integer NOT NULL,
	`installment_number` integer NOT NULL,
	`amount` real NOT NULL,
	`due_date` text NOT NULL,
	`received_amount` real DEFAULT 0 NOT NULL,
	`payment_date` text,
	`interest` real DEFAULT 0 NOT NULL,
	`penalty` real DEFAULT 0 NOT NULL,
	`discount` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'aberto' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`billing_id`) REFERENCES `billings`(`id`) ON UPDATE no action ON DELETE no action
);
