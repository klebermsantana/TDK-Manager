CREATE TABLE `service_call_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_call_id` integer NOT NULL,
	`name` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`service_call_id`) REFERENCES `service_calls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_call_files_storage_key_unique` ON `service_call_files` (`storage_key`);--> statement-breakpoint
CREATE INDEX `idx_service_call_files_call` ON `service_call_files` (`service_call_id`);--> statement-breakpoint
ALTER TABLE `service_calls` ADD `executed_service` text;--> statement-breakpoint
ALTER TABLE `service_calls` ADD `consumables_used` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `service_calls` ADD `consumables_description` text;--> statement-breakpoint
ALTER TABLE `service_calls` ADD `parts_replaced` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `service_calls` ADD `parts_description` text;--> statement-breakpoint
ALTER TABLE `service_calls` ADD `expenses_amount` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `service_calls` ADD `expenses_description` text;