CREATE TABLE `billings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`number` text NOT NULL,
	`status` text DEFAULT 'pendente' NOT NULL,
	`payment_terms` text DEFAULT 'À vista' NOT NULL,
	`installments` integer DEFAULT 1 NOT NULL,
	`due_date` text,
	`material_invoice` text,
	`service_invoice` text,
	`material_amount` real DEFAULT 0 NOT NULL,
	`service_amount` real DEFAULT 0 NOT NULL,
	`total` real NOT NULL,
	`received_amount` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billings_sale_id_unique` ON `billings` (`sale_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billings_number_unique` ON `billings` (`number`);