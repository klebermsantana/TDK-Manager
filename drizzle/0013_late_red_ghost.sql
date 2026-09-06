ALTER TABLE `users` ADD `job_title` text;--> statement-breakpoint
ALTER TABLE `users` ADD `permissions` text DEFAULT '["crm"]' NOT NULL;