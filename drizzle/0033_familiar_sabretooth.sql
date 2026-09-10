CREATE TABLE `service_call_financials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_call_id` integer NOT NULL,
	`revenue_amount` real,
	`notes` text,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`service_call_id`) REFERENCES `service_calls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_call_financials_service_call_id_unique` ON `service_call_financials` (`service_call_id`);