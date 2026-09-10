CREATE TABLE `service_call_sla_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer,
	`priority` text,
	`service_type` text,
	`target_minutes` integer NOT NULL,
	`pause_pending` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_service_call_sla_company` ON `service_call_sla_policies` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_service_call_sla_priority` ON `service_call_sla_policies` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_service_call_sla_service_type` ON `service_call_sla_policies` (`service_type`);--> statement-breakpoint
CREATE INDEX `idx_service_call_sla_active` ON `service_call_sla_policies` (`active`);