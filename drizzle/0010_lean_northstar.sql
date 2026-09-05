CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`document` text,
	`email` text,
	`phone` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_name_unique` ON `suppliers` (`name`);--> statement-breakpoint
CREATE TABLE `payables` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_id` integer NOT NULL,
	`group_number` text NOT NULL,
	`reference` text,
	`description` text NOT NULL,
	`category` text DEFAULT 'outros' NOT NULL,
	`installment_number` integer DEFAULT 1 NOT NULL,
	`installment_count` integer DEFAULT 1 NOT NULL,
	`amount` real NOT NULL,
	`due_date` text NOT NULL,
	`paid_amount` real DEFAULT 0 NOT NULL,
	`payment_date` text,
	`status` text DEFAULT 'aberto' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
