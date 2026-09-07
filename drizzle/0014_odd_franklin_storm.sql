CREATE TABLE `company_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT 'TDK Soluções que Transformam' NOT NULL,
	`document` text,
	`email` text,
	`phone` text,
	`address` text,
	`city` text,
	`state` text,
	`postal_code` text,
	`default_price_table` text DEFAULT 'padrao' NOT NULL,
	`proposal_validity_days` integer DEFAULT 15 NOT NULL,
	`default_payment_terms` text DEFAULT 'A prazo' NOT NULL,
	`default_installments` integer DEFAULT 1 NOT NULL,
	`default_due_days` integer DEFAULT 30 NOT NULL,
	`proposal_notes` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
