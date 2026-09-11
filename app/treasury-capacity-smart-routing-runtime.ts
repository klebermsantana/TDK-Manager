import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function ensureTreasuryCapacityRoutingSettings() {
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_capacity_routing_settings (
      id INTEGER PRIMARY KEY,
      auto_assignment_enabled INTEGER NOT NULL DEFAULT 0,
      minimum_skill_level INTEGER NOT NULL DEFAULT 2,
      feedback_learning_enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  try {
    await db.run(sql.raw(`ALTER TABLE treasury_capacity_routing_settings ADD COLUMN feedback_learning_enabled INTEGER NOT NULL DEFAULT 1`));
  } catch {}
  await db.run(sql.raw(`
    INSERT OR IGNORE INTO treasury_capacity_routing_settings (
      id, auto_assignment_enabled, minimum_skill_level, feedback_learning_enabled
    ) VALUES (1, 0, 2, 1)
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_capacity_routing_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurrence_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      candidate_name TEXT NOT NULL,
      candidate_email TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      domain TEXT,
      feedback TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      note TEXT,
      candidate_score REAL,
      performed_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (occurrence_id) REFERENCES treasury_capacity_alert_occurrences(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_capacity_routing_feedback_once ON treasury_capacity_routing_feedback(occurrence_id, user_id, performed_by)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_routing_feedback_user_context ON treasury_capacity_routing_feedback(user_id, domain, alert_type)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_routing_feedback_created ON treasury_capacity_routing_feedback(created_at)`));
}
