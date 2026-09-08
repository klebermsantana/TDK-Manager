CREATE TABLE `project_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`name` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_files_storage_key_unique` ON `project_files` (`storage_key`);--> statement-breakpoint
CREATE INDEX `idx_project_files_sale` ON `project_files` (`sale_id`);