ALTER TABLE `sales` ADD `project_manager` text;--> statement-breakpoint
ALTER TABLE `sales` ADD `progress` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `project_notes` text;