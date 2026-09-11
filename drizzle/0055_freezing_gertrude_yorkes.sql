CREATE TABLE `service_technician_settlement_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`settlement_id` integer,
	`item_id` integer,
	`technician_id` integer,
	`action` text NOT NULL,
	`performed_by` text NOT NULL,
	`note` text,
	`before_json` text,
	`after_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `service_technician_settlements`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`item_id`) REFERENCES `service_technician_settlement_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`technician_id`) REFERENCES `service_technicians`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_service_technician_settlement_audit_settlement` ON `service_technician_settlement_audit` (`settlement_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_settlement_audit_tech` ON `service_technician_settlement_audit` (`technician_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `service_technician_settlement_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`settlement_id` integer NOT NULL,
	`assignment_id` integer NOT NULL,
	`service_call_id` integer NOT NULL,
	`approved_amount_snapshot` real DEFAULT 0 NOT NULL,
	`reimbursement_snapshot` real DEFAULT 0 NOT NULL,
	`settlement_amount` real DEFAULT 0 NOT NULL,
	`divergence_amount` real DEFAULT 0 NOT NULL,
	`divergence_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `service_technician_settlements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `service_call_technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_call_id`) REFERENCES `service_calls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_service_technician_settlement_item` ON `service_technician_settlement_items` (`settlement_id`,`assignment_id`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_settlement_items_assignment` ON `service_technician_settlement_items` (`assignment_id`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_settlement_items_call` ON `service_technician_settlement_items` (`service_call_id`);--> statement-breakpoint
CREATE TABLE `service_technician_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`technician_id` integer NOT NULL,
	`supplier_id` integer,
	`period_from` text NOT NULL,
	`period_to` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`invoice_number` text,
	`invoice_date` text,
	`subtotal` real DEFAULT 0 NOT NULL,
	`reimbursement_total` real DEFAULT 0 NOT NULL,
	`adjustment_total` real DEFAULT 0 NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`submitted_by` text,
	`submitted_at` text,
	`approved_by` text,
	`approved_at` text,
	`due_date` text,
	`payable_id` integer,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `service_technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payable_id`) REFERENCES `payables`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_service_technician_settlements_tech` ON `service_technician_settlements` (`technician_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_settlements_period` ON `service_technician_settlements` (`period_from`,`period_to`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_settlements_payable` ON `service_technician_settlements` (`payable_id`);