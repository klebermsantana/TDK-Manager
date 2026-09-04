CREATE TABLE `catalog_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`code` text,
	`description` text NOT NULL,
	`unit` text DEFAULT 'un' NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`competitive_price` real DEFAULT 0 NOT NULL,
	`standard_price` real DEFAULT 0 NOT NULL,
	`value_price` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `proposals` ADD `price_table` text DEFAULT 'padrao' NOT NULL;