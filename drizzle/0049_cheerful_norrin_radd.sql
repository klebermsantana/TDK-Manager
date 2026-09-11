CREATE TABLE `treasury_routing_schedule_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer,
	`user_id` integer NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`performed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `treasury_routing_schedules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_routing_schedule_audit_schedule` ON `treasury_routing_schedule_audit` (`schedule_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_treasury_routing_schedule_audit_user` ON `treasury_routing_schedule_audit` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `treasury_routing_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`schedule_type` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`coverage_user_id` integer,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coverage_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_routing_schedule_user_dates` ON `treasury_routing_schedules` (`user_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `idx_treasury_routing_schedule_active_dates` ON `treasury_routing_schedules` (`active`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `idx_treasury_routing_schedule_coverage` ON `treasury_routing_schedules` (`coverage_user_id`,`active`);