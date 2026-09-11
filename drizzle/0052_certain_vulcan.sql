CREATE TABLE `treasury_capacity_routing_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`auto_assignment_enabled` integer DEFAULT false NOT NULL,
	`minimum_skill_level` integer DEFAULT 2 NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
