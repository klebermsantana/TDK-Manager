CREATE INDEX `idx_payables_due_date` ON `payables` (`due_date`);--> statement-breakpoint
CREATE INDEX `idx_payables_supplier_status` ON `payables` (`supplier_id`,`status`);