CREATE TABLE `sale_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_cost` real DEFAULT 0 NOT NULL,
	`unit_price` real NOT NULL,
	`total` real NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposal_id` integer NOT NULL,
	`opportunity_id` integer NOT NULL,
	`number` text NOT NULL,
	`company_name` text NOT NULL,
	`opportunity_title` text NOT NULL,
	`status` text DEFAULT 'aguardando' NOT NULL,
	`scheduled_start` text,
	`scheduled_end` text,
	`subtotal` real NOT NULL,
	`discount` real DEFAULT 0 NOT NULL,
	`total` real NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_proposal_id_unique` ON `sales` (`proposal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_number_unique` ON `sales` (`number`);