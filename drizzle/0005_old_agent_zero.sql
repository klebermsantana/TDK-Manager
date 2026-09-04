ALTER TABLE `proposal_items` ADD `catalog_id` integer REFERENCES catalog_items(id);--> statement-breakpoint
ALTER TABLE `proposal_items` ADD `unit_cost` real DEFAULT 0 NOT NULL;