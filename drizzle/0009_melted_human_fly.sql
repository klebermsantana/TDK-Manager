PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_proposals` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`opportunity_id` integer,`company_id` integer,`number` text NOT NULL,`customer_order` text,`requester` text,`status` text DEFAULT 'rascunho' NOT NULL,`price_table` text DEFAULT 'padrao' NOT NULL,`valid_until` text,`discount` real DEFAULT 0 NOT NULL,`subtotal` real DEFAULT 0 NOT NULL,`total` real DEFAULT 0 NOT NULL,`notes` text,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`),FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`));--> statement-breakpoint
CREATE TABLE `__new_proposal_items` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`proposal_id` integer NOT NULL,`catalog_id` integer,`category` text NOT NULL,`description` text NOT NULL,`quantity` real DEFAULT 1 NOT NULL,`unit_cost` real DEFAULT 0 NOT NULL,`unit_price` real DEFAULT 0 NOT NULL,`total` real DEFAULT 0 NOT NULL,FOREIGN KEY (`proposal_id`) REFERENCES `__new_proposals`(`id`),FOREIGN KEY (`catalog_id`) REFERENCES `catalog_items`(`id`));--> statement-breakpoint
CREATE TABLE `__new_sales` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`proposal_id` integer NOT NULL,`opportunity_id` integer,`number` text NOT NULL,`company_name` text NOT NULL,`opportunity_title` text NOT NULL,`status` text DEFAULT 'aguardando' NOT NULL,`scheduled_start` text,`scheduled_end` text,`subtotal` real NOT NULL,`discount` real DEFAULT 0 NOT NULL,`total` real NOT NULL,`cost` real DEFAULT 0 NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (`proposal_id`) REFERENCES `__new_proposals`(`id`),FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`));--> statement-breakpoint
CREATE TABLE `__new_sale_items` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`sale_id` integer NOT NULL,`category` text NOT NULL,`description` text NOT NULL,`quantity` real NOT NULL,`unit_cost` real DEFAULT 0 NOT NULL,`unit_price` real NOT NULL,`total` real NOT NULL,FOREIGN KEY (`sale_id`) REFERENCES `__new_sales`(`id`));--> statement-breakpoint
CREATE TABLE `__new_billings` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`sale_id` integer NOT NULL,`number` text NOT NULL,`status` text DEFAULT 'pendente' NOT NULL,`payment_terms` text DEFAULT 'À vista' NOT NULL,`installments` integer DEFAULT 1 NOT NULL,`due_date` text,`material_invoice` text,`service_invoice` text,`material_amount` real DEFAULT 0 NOT NULL,`service_amount` real DEFAULT 0 NOT NULL,`total` real NOT NULL,`received_amount` real DEFAULT 0 NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (`sale_id`) REFERENCES `__new_sales`(`id`));--> statement-breakpoint
CREATE TABLE `__new_receivables` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`billing_id` integer NOT NULL,`installment_number` integer NOT NULL,`amount` real NOT NULL,`due_date` text NOT NULL,`received_amount` real DEFAULT 0 NOT NULL,`payment_date` text,`interest` real DEFAULT 0 NOT NULL,`penalty` real DEFAULT 0 NOT NULL,`discount` real DEFAULT 0 NOT NULL,`status` text DEFAULT 'aberto' NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (`billing_id`) REFERENCES `__new_billings`(`id`));--> statement-breakpoint
INSERT INTO `__new_proposals` SELECT `id`,`opportunity_id`,NULL,`number`,NULL,NULL,`status`,`price_table`,`valid_until`,`discount`,`subtotal`,`total`,`notes`,`created_at`,`updated_at` FROM `proposals`;--> statement-breakpoint
INSERT INTO `__new_proposal_items` (`id`,`proposal_id`,`catalog_id`,`category`,`description`,`quantity`,`unit_cost`,`unit_price`,`total`) SELECT `id`,`proposal_id`,`catalog_id`,`category`,`description`,`quantity`,`unit_cost`,`unit_price`,`total` FROM `proposal_items`;--> statement-breakpoint
INSERT INTO `__new_sales` SELECT * FROM `sales`;--> statement-breakpoint
INSERT INTO `__new_sale_items` SELECT * FROM `sale_items`;--> statement-breakpoint
INSERT INTO `__new_billings` SELECT * FROM `billings`;--> statement-breakpoint
INSERT INTO `__new_receivables` SELECT * FROM `receivables`;--> statement-breakpoint
DROP TABLE `receivables`;--> statement-breakpoint
DROP TABLE `billings`;--> statement-breakpoint
DROP TABLE `sale_items`;--> statement-breakpoint
DROP TABLE `sales`;--> statement-breakpoint
DROP TABLE `proposal_items`;--> statement-breakpoint
DROP TABLE `proposals`;--> statement-breakpoint
ALTER TABLE `__new_proposals` RENAME TO `proposals`;--> statement-breakpoint
ALTER TABLE `__new_proposal_items` RENAME TO `proposal_items`;--> statement-breakpoint
ALTER TABLE `__new_sales` RENAME TO `sales`;--> statement-breakpoint
ALTER TABLE `__new_sale_items` RENAME TO `sale_items`;--> statement-breakpoint
ALTER TABLE `__new_billings` RENAME TO `billings`;--> statement-breakpoint
ALTER TABLE `__new_receivables` RENAME TO `receivables`;--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_number_unique` ON `proposals` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_proposal_id_unique` ON `sales` (`proposal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_number_unique` ON `sales` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `billings_sale_id_unique` ON `billings` (`sale_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billings_number_unique` ON `billings` (`number`);
