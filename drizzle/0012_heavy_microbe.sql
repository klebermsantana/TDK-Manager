ALTER TABLE `payables` ADD `company_id` integer REFERENCES companies(id);--> statement-breakpoint
ALTER TABLE `payables` ADD `project` text;--> statement-breakpoint
CREATE INDEX `idx_payables_company` ON `payables` (`company_id`);