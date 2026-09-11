ALTER TABLE `treasury_alert_occurrences` ADD `ack_escalated_at` text;--> statement-breakpoint
ALTER TABLE `treasury_alert_occurrences` ADD `resolution_escalated_at` text;--> statement-breakpoint
ALTER TABLE `treasury_alert_settings` ADD `escalation_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `treasury_alert_settings` ADD `critical_ack_sla_minutes` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `treasury_alert_settings` ADD `high_ack_sla_minutes` integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE `treasury_alert_settings` ADD `resolution_sla_minutes` integer DEFAULT 240 NOT NULL;