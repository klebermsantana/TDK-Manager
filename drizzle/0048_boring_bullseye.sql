CREATE TABLE `treasury_routing_profile_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`performed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_routing_profile_audit_user` ON `treasury_routing_profile_audit` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `treasury_routing_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`availability` text DEFAULT 'available' NOT NULL,
	`availability_until` text,
	`notes` text,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_treasury_routing_profile_user` ON `treasury_routing_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_treasury_routing_profile_availability` ON `treasury_routing_profiles` (`availability`);--> statement-breakpoint
CREATE TABLE `treasury_routing_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`domain` text NOT NULL,
	`level` integer DEFAULT 2 NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_treasury_routing_skill_user_domain` ON `treasury_routing_skills` (`user_id`,`domain`);--> statement-breakpoint
CREATE INDEX `idx_treasury_routing_skill_domain_level` ON `treasury_routing_skills` (`domain`,`level`);