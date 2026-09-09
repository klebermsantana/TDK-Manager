ALTER TABLE `companies` ADD `is_client` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `is_service_taker` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `is_service_location` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `logo_storage_key` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `logo_content_type` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `logo_name` text;--> statement-breakpoint
ALTER TABLE `service_calls` ADD `location_company_id` integer REFERENCES companies(id);