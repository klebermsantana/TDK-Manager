CREATE TABLE `service_technician_absences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`technician_id` integer NOT NULL,
	`absence_type` text DEFAULT 'unavailable' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`reason` text,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `service_technicians`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_service_technician_absences_tech` ON `service_technician_absences` (`technician_id`,`active`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_absences_period` ON `service_technician_absences` (`starts_at`,`ends_at`,`active`);--> statement-breakpoint
CREATE TABLE `service_technician_certificates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`technician_id` integer NOT NULL,
	`certificate_type` text NOT NULL,
	`document_number` text,
	`issued_at` text,
	`expires_at` text,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `service_technicians`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_service_technician_certificates_tech` ON `service_technician_certificates` (`technician_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_certificates_type` ON `service_technician_certificates` (`certificate_type`,`expires_at`,`active`);--> statement-breakpoint
CREATE TABLE `service_technician_operational_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`technician_id` integer,
	`action` text NOT NULL,
	`performed_by` text NOT NULL,
	`note` text,
	`before_json` text,
	`after_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `service_technicians`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_service_technician_operational_audit_tech` ON `service_technician_operational_audit` (`technician_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `service_technician_operational_profiles` (
	`technician_id` integer PRIMARY KEY NOT NULL,
	`availability` text DEFAULT 'available' NOT NULL,
	`availability_until` text,
	`base_city` text,
	`base_state` text,
	`service_radius_km` real DEFAULT 50 NOT NULL,
	`region_mode` text DEFAULT 'preferred' NOT NULL,
	`work_days` text DEFAULT '[1,2,3,4,5]' NOT NULL,
	`work_start` text DEFAULT '08:00' NOT NULL,
	`work_end` text DEFAULT '18:00' NOT NULL,
	`own_vehicle` integer DEFAULT false NOT NULL,
	`vehicle_type` text,
	`vehicle_plate` text,
	`operational_notes` text,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `service_technicians`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_service_technician_operational_availability` ON `service_technician_operational_profiles` (`availability`,`availability_until`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_operational_base` ON `service_technician_operational_profiles` (`base_state`,`base_city`);--> statement-breakpoint
CREATE TABLE `service_technician_regions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`technician_id` integer NOT NULL,
	`label` text NOT NULL,
	`match_text` text NOT NULL,
	`coverage_mode` text DEFAULT 'preferred' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `service_technicians`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_service_technician_regions_tech` ON `service_technician_regions` (`technician_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_regions_mode` ON `service_technician_regions` (`coverage_mode`,`active`);--> statement-breakpoint
CREATE TABLE `service_technician_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`technician_id` integer NOT NULL,
	`skill_code` text NOT NULL,
	`level` integer DEFAULT 2 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `service_technicians`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_service_technician_skill` ON `service_technician_skills` (`technician_id`,`skill_code`);--> statement-breakpoint
CREATE INDEX `idx_service_technician_skill_code` ON `service_technician_skills` (`skill_code`,`active`,`level`);