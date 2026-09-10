CREATE TABLE `service_call_pendencies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_call_id` integer NOT NULL,
	`reason` text NOT NULL,
	`notes` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`started_by` text NOT NULL,
	`ended_by` text,
	FOREIGN KEY (`service_call_id`) REFERENCES `service_calls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_service_call_pendencies_call` ON `service_call_pendencies` (`service_call_id`);--> statement-breakpoint
CREATE INDEX `idx_service_call_pendencies_open` ON `service_call_pendencies` (`service_call_id`,`ended_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_service_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` text NOT NULL,
	`company_id` integer,
	`service_taker_company_id` integer,
	`company_name` text NOT NULL,
	`service_taker` text,
	`request_origin` text,
	`department` text,
	`customer_ticket` text,
	`sale_id` integer,
	`location` text,
	`location_id` integer,
	`location_company_id` integer,
	`contact_name` text,
	`technician` text,
	`service_type` text DEFAULT 'visita' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`scheduled_at` text,
	`status` text DEFAULT 'aberto' NOT NULL,
	`subject` text NOT NULL,
	`description` text NOT NULL,
	`executed_service` text,
	`consumables_used` integer DEFAULT false NOT NULL,
	`consumables_description` text,
	`parts_replaced` integer DEFAULT false NOT NULL,
	`parts_description` text,
	`expenses_amount` real DEFAULT 0 NOT NULL,
	`expenses_description` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_taker_company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `service_locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_service_calls`("id", "number", "company_id", "service_taker_company_id", "company_name", "service_taker", "request_origin", "department", "customer_ticket", "sale_id", "location", "location_id", "location_company_id", "contact_name", "technician", "service_type", "priority", "scheduled_at", "status", "subject", "description", "executed_service", "consumables_used", "consumables_description", "parts_replaced", "parts_description", "expenses_amount", "expenses_description", "created_by", "created_at", "updated_at") SELECT "id", "number", "company_id", "service_taker_company_id", "company_name", "service_taker", "request_origin", "department", "customer_ticket", "sale_id", "location", "location_id", "location_company_id", "contact_name", "technician", "service_type", "priority", "scheduled_at", "status", "subject", "description", "executed_service", "consumables_used", "consumables_description", "parts_replaced", "parts_description", "expenses_amount", "expenses_description", "created_by", "created_at", "updated_at" FROM `service_calls`;--> statement-breakpoint
DROP TABLE `service_calls`;--> statement-breakpoint
ALTER TABLE `__new_service_calls` RENAME TO `service_calls`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `service_calls_number_unique` ON `service_calls` (`number`);--> statement-breakpoint
CREATE INDEX `idx_service_calls_status` ON `service_calls` (`status`);--> statement-breakpoint
CREATE INDEX `idx_service_calls_company` ON `service_calls` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_service_calls_scheduled` ON `service_calls` (`scheduled_at`);