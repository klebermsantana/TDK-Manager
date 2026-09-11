CREATE TABLE `service_call_technicians` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_call_id` integer NOT NULL,
	`technician_id` integer NOT NULL,
	`role` text DEFAULT 'primary' NOT NULL,
	`assignment_status` text DEFAULT 'assigned' NOT NULL,
	`assigned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`hours` real DEFAULT 1 NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`equipment_qty` real DEFAULT 0 NOT NULL,
	`negotiated_amount` real,
	`rate_rule_id` integer,
	`remuneration_type_snapshot` text,
	`rate_amount_snapshot` real,
	`surcharge_amount` real DEFAULT 0 NOT NULL,
	`reimbursement_amount` real DEFAULT 0 NOT NULL,
	`expected_cost` real DEFAULT 0 NOT NULL,
	`realized_cost` real,
	`cost_nature` text DEFAULT 'payable' NOT NULL,
	`apportionment_status` text DEFAULT 'planned' NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`payable_id` integer,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`service_call_id`) REFERENCES `service_calls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`technician_id`) REFERENCES `service_technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rate_rule_id`) REFERENCES `service_technician_rate_rules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payable_id`) REFERENCES `payables`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_service_call_technician` ON `service_call_technicians` (`service_call_id`,`technician_id`);--> statement-breakpoint
CREATE INDEX `idx_service_call_technicians_call` ON `service_call_technicians` (`service_call_id`,`assignment_status`);--> statement-breakpoint
CREATE INDEX `idx_service_call_technicians_tech` ON `service_call_technicians` (`technician_id`,`apportionment_status`);--> statement-breakpoint
CREATE INDEX `idx_service_call_technicians_payable` ON `service_call_technicians` (`payable_id`);--> statement-breakpoint
CREATE TABLE `service_technician_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`technician_id` integer,
	`assignment_id` integer,
	`service_call_id` integer,
	`action` text NOT NULL,
	`performed_by` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `service_technicians`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignment_id`) REFERENCES `service_call_technicians`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`service_call_id`) REFERENCES `service_calls`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_service_technician_audit_tech` ON `service_technician_audit` (`technician_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_audit_assignment` ON `service_technician_audit` (`assignment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_audit_call` ON `service_technician_audit` (`service_call_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `service_technician_rate_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`technician_id` integer,
	`company_id` integer,
	`service_type` text,
	`region` text,
	`remuneration_type` text DEFAULT 'per_visit' NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`minimum_hours` real DEFAULT 0 NOT NULL,
	`night_surcharge_pct` real DEFAULT 0 NOT NULL,
	`weekend_surcharge_pct` real DEFAULT 0 NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`effective_from` text,
	`effective_to` text,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `service_technicians`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_service_technician_rates_tech` ON `service_technician_rate_rules` (`technician_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_rates_context` ON `service_technician_rate_rules` (`company_id`,`service_type`,`active`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_rates_effective` ON `service_technician_rate_rules` (`effective_from`,`effective_to`);--> statement-breakpoint
CREATE TABLE `service_technicians` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`supplier_id` integer,
	`name` text NOT NULL,
	`document` text,
	`email` text,
	`phone` text,
	`relationship_type` text DEFAULT 'freelancer' NOT NULL,
	`financial_mode` text DEFAULT 'per_service' NOT NULL,
	`payment_method` text,
	`pix_key` text,
	`due_days` integer DEFAULT 7 NOT NULL,
	`requires_invoice` integer DEFAULT false NOT NULL,
	`monthly_cost` real,
	`monthly_productive_hours` real DEFAULT 160 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_service_technicians_active` ON `service_technicians` (`active`,`name`);--> statement-breakpoint
CREATE INDEX `idx_service_technicians_relationship` ON `service_technicians` (`relationship_type`,`financial_mode`);--> statement-breakpoint
CREATE INDEX `idx_service_technicians_user` ON `service_technicians` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_service_technicians_supplier` ON `service_technicians` (`supplier_id`);