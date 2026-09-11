import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function ensureTreasuryCapacityRoutingSettings() {
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_capacity_routing_settings (
      id INTEGER PRIMARY KEY,
      auto_assignment_enabled INTEGER NOT NULL DEFAULT 0,
      minimum_skill_level INTEGER NOT NULL DEFAULT 2,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await db.run(sql.raw(`
    INSERT OR IGNORE INTO treasury_capacity_routing_settings (
      id, auto_assignment_enabled, minimum_skill_level
    ) VALUES (1, 0, 2)
  `));
}
