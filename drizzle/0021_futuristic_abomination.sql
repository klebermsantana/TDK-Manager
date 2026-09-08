CREATE TABLE `service_call_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_call_id` integer NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`changed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`service_call_id`) REFERENCES `service_calls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_service_call_history_call` ON `service_call_history` (`service_call_id`);--> statement-breakpoint
CREATE TABLE `service_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` text NOT NULL,
	`company_id` integer,
	`company_name` text NOT NULL,
	`sale_id` integer,
	`location` text,
	`contact_name` text,
	`technician` text,
	`service_type` text DEFAULT 'visita' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`scheduled_at` text,
	`status` text DEFAULT 'triagem' NOT NULL,
	`subject` text NOT NULL,
	`description` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_calls_number_unique` ON `service_calls` (`number`);--> statement-breakpoint
CREATE INDEX `idx_service_calls_status` ON `service_calls` (`status`);--> statement-breakpoint
CREATE INDEX `idx_service_calls_company` ON `service_calls` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_service_calls_scheduled` ON `service_calls` (`scheduled_at`);