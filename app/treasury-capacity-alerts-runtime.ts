import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function ensureTreasuryCapacityAlertTables() {
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_capacity_alert_settings (
      id INTEGER PRIMARY KEY,
      lookahead_days INTEGER NOT NULL DEFAULT 7,
      low_capacity_threshold_pct REAL NOT NULL DEFAULT 70,
      uncovered_enabled INTEGER NOT NULL DEFAULT 1,
      single_point_enabled INTEGER NOT NULL DEFAULT 1,
      absence_without_coverage_enabled INTEGER NOT NULL DEFAULT 1,
      low_capacity_enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await db.run(sql.raw(`
    INSERT OR IGNORE INTO treasury_capacity_alert_settings (
      id, lookahead_days, low_capacity_threshold_pct,
      uncovered_enabled, single_point_enabled, absence_without_coverage_enabled, low_capacity_enabled
    ) VALUES (1, 7, 70, 1, 1, 1, 1)
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
      resolved_at TEXT,
      resolution_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_alert_key_status ON treasury_capacity_alert_occurrences(alert_key, status)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_alert_status_severity ON treasury_capacity_alert_occurrences(status, severity)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_capacity_alert_risk_date ON treasury_capacity_alert_occurrences(risk_date, status)`));

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
}
