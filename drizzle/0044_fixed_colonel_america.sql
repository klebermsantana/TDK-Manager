CREATE TABLE `treasury_alert_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`forecast_horizon_days` integer DEFAULT 30 NOT NULL,
	`reconciliation_min_pct` real DEFAULT 95 NOT NULL,
	`closing_cadence` text DEFAULT 'daily' NOT NULL,
	`negative_forecast_enabled` integer DEFAULT true NOT NULL,
	`critical_tasks_enabled` integer DEFAULT true NOT NULL,
	`reconciliation_enabled` integer DEFAULT true NOT NULL,
	`closing_overdue_enabled` integer DEFAULT true NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
