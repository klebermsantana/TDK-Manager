CREATE TABLE `equipment_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text,
	`description` text NOT NULL,
	`brand` text,
	`model` text,
	`unit` text DEFAULT 'un' NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `service_call_equipment` ADD `equipment_item_id` integer REFERENCES equipment_items(id);--> statement-breakpoint
ALTER TABLE `service_call_materials` ADD `unit_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `service_call_materials` ADD `price_table` text DEFAULT 'padrao' NOT NULL;