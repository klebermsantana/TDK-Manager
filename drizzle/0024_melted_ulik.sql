CREATE TABLE `service_call_equipment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_call_id` integer NOT NULL,
	`description` text NOT NULL,
	`brand_model` text,
	`quantity` real DEFAULT 1 NOT NULL,
	`removed_serial` text,
	`installed_serial` text,
	`reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`service_call_id`) REFERENCES `service_calls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_service_call_equipment_call` ON `service_call_equipment` (`service_call_id`);--> statement-breakpoint
CREATE TABLE `service_call_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_call_id` integer NOT NULL,
	`category` text DEFAULT 'outros' NOT NULL,
	`description` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`expense_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`service_call_id`) REFERENCES `service_calls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_service_call_expenses_call` ON `service_call_expenses` (`service_call_id`);--> statement-breakpoint
CREATE TABLE `service_call_materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_call_id` integer NOT NULL,
	`catalog_id` integer,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'un' NOT NULL,
	`unit_cost` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`service_call_id`) REFERENCES `service_calls`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`catalog_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_service_call_materials_call` ON `service_call_materials` (`service_call_id`);--> statement-breakpoint
CREATE TABLE `service_call_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_call_id` integer NOT NULL,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'serviço' NOT NULL,
	`technician` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`service_call_id`) REFERENCES `service_calls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_service_call_services_call` ON `service_call_services` (`service_call_id`);