PRAGMA foreign_keys=OFF;--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer,
	`company_id` integer,
	`number` text NOT NULL,
	`customer_order` text,
	`requester` text,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`price_table` text DEFAULT 'padrao' NOT NULL,
	`valid_until` text,
	`discount` real DEFAULT 0 NOT NULL,
	`subtotal` real DEFAULT 0 NOT NULL,
	`total` real DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_proposals`("id", "opportunity_id", "company_id", "number", "customer_order", "requester", "status", "price_table", "valid_until", "discount", "subtotal", "total", "notes", "created_at", "updated_at") SELECT "id", "opportunity_id", NULL, "number", NULL, NULL, "status", "price_table", "valid_until", "discount", "subtotal", "total", "notes", "created_at", "updated_at" FROM `proposals`;--> statement-breakpoint
DROP TABLE `proposals`;--> statement-breakpoint
ALTER TABLE `__new_proposals` RENAME TO `proposals`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_number_unique` ON `proposals` (`number`);--> statement-breakpoint
CREATE TABLE `__new_sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposal_id` integer NOT NULL,
	`opportunity_id` integer,
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
INSERT INTO `__new_sales`("id", "proposal_id", "opportunity_id", "number", "company_name", "opportunity_title", "status", "scheduled_start", "scheduled_end", "subtotal", "discount", "total", "cost", "created_at", "updated_at") SELECT "id", "proposal_id", "opportunity_id", "number", "company_name", "opportunity_title", "status", "scheduled_start", "scheduled_end", "subtotal", "discount", "total", "cost", "created_at", "updated_at" FROM `sales`;--> statement-breakpoint
DROP TABLE `sales`;--> statement-breakpoint
ALTER TABLE `__new_sales` RENAME TO `sales`;--> statement-breakpoint
CREATE UNIQUE INDEX `sales_proposal_id_unique` ON `sales` (`proposal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_number_unique` ON `sales` (`number`);
