CREATE TABLE `service_locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_service_locations_company` ON `service_locations` (`company_id`);--> statement-breakpoint
ALTER TABLE `service_calls` ADD `service_taker_company_id` integer REFERENCES companies(id);--> statement-breakpoint
ALTER TABLE `service_calls` ADD `location_id` integer REFERENCES service_locations(id);