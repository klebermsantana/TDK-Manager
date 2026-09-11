import { sql } from "drizzle-orm";
import { getDb } from "@/db";

async function addColumnIfMissing(statement: string) {
  try {
    await getDb().run(sql.raw(statement));
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!message.includes("duplicate column") && !message.includes("already exists")) throw error;
  }
}

export async function ensureTreasuryCapacityAlertTables() {
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_capacity_alert_settings (
      id INTEGER PRIMARY KEY,
      lookahead_days INTEGER NOT NULL DEFAULT 7,
      low_capacity_threshold_pct REAL NOT NULL DEFAULT 70,
      preparation_lead_business_days INTEGER NOT NULL DEFAULT 1,
      uncovered_enabled INTEGER NOT NULL DEFAULT 1,
      single_point_enabled INTEGER NOT NULL DEFAULT 1,
      absence_without_coverage_enabled INTEGER NOT NULL DEFAULT 1,
      low_capacity_enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await addColumnIfMissing("ALTER TABLE treasury_capacity_alert_settings ADD COLUMN preparation_lead_business_days INTEGER NOT NULL DEFAULT 1");
  await db.run(sql.raw(`
    INSERT OR IGNORE INTO treasury_capacity_alert_settings (
      id, lookahead_days, low_capacity_threshold_pct, preparation_lead_business_days,
      uncovered_enabled, single_point_enabled, absence_without_coverage_enabled, low_capacity_enabled
    ) VALUES (1, 7, 70, 1, 1, 1, 1, 1)
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_capacity_alert_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_key TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      risk_date TEXT NOT NULL,
      domain TEXT,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      acknowledgement_note TEXT,
      assigned_user_id INTEGER,
      assigned_name TEXT,
      assigned_email TEXT,
      assigned_at TEXT,
      assignment_source TEXT,
      preparation_due_at TEXT,
      prepared_by TEXT,
      prepared_at TEXT,
      preparation_note TEXT,
      preparation_escalated_at TEXT,
      resolved_at TEXT,
      resolution_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `));
  await addColumnIfMissing("ALTER TABLE treasury_capacity_alert_occurrences ADD COLUMN assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
  await addColumnIfMissing("ALTER TABLE treasury_capacity_alert_occurrences ADD COLUMN assigned_name TEXT");
  await addColumnIfMissing("ALTER TABLE treasury_capacity_alert_occurrences ADD COLUMN assigned_email TEXT");
  await addColumnIfMissing("ALTER TABLE treasury_capacity_alert_occurrences ADD COLUMN assigned_at TEXT");
  await addColumnIfMissing("ALTER TABLE treasury_capacity_alert_occurrences ADD COLUMN assignment_source TEXT");
  await addColumnIfMissing("ALTER TABLE treasury_capacity_alert_occurrences ADD COLUMN preparation_due_at TEXT");
  await addColumnIfMissing("ALTER TABLE treasury_capacity_alert_occurrences ADD COLUMN prepared_by TEXT");
  await addColumnIfMissing("ALTER TABLE treasury_capacity_alert_occurrences ADD COLUMN prepared_at TEXT");
  await addColumnIfMissing("ALTER TABLE treasury_capacity_alert_occurrences ADD COLUMN preparation_note TEXT");
  await addColumnIfMissing("ALTER TABLE treasury_capacity_alert_occurrences ADD COLUMN preparation_escalated_at TEXT");
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_alert_key_status ON treasury_capacity_alert_occurrences(alert_key, status)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_alert_status_severity ON treasury_capacity_alert_occurrences(status, severity)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_alert_risk_date ON treasury_capacity_alert_occurrences(risk_date, status)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_alert_assignee ON treasury_capacity_alert_occurrences(assigned_user_id, status)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_alert_preparation_due ON treasury_capacity_alert_occurrences(preparation_due_at, status)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_capacity_alert_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurrence_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (occurrence_id) REFERENCES treasury_capacity_alert_occurrences(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_alert_audit_occurrence ON treasury_capacity_alert_audit(occurrence_id, created_at)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_capacity_alert_assignment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurrence_id INTEGER NOT NULL,
      user_id INTEGER,
      assigned_name TEXT NOT NULL,
      assigned_email TEXT NOT NULL,
      assignment_source TEXT NOT NULL,
      assigned_by TEXT NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      unassigned_at TEXT,
      unassigned_by TEXT,
      FOREIGN KEY (occurrence_id) REFERENCES treasury_capacity_alert_occurrences(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_alert_assignment_occurrence ON treasury_capacity_alert_assignment_history(occurrence_id, assigned_at)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_alert_assignment_user ON treasury_capacity_alert_assignment_history(user_id, unassigned_at)`));
}
