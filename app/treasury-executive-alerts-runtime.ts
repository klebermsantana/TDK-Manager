import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureTreasuryClosingTaskTables } from "@/app/treasury-closing-tasks-runtime";

export async function ensureTreasuryAlertSettings() {
  await ensureTreasuryClosingTaskTables();
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_alert_settings (
      id INTEGER PRIMARY KEY,
      forecast_horizon_days INTEGER NOT NULL DEFAULT 30,
      reconciliation_min_pct REAL NOT NULL DEFAULT 95,
      closing_cadence TEXT NOT NULL DEFAULT 'daily',
      negative_forecast_enabled INTEGER NOT NULL DEFAULT 1,
      critical_tasks_enabled INTEGER NOT NULL DEFAULT 1,
      reconciliation_enabled INTEGER NOT NULL DEFAULT 1,
      closing_overdue_enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await db.run(sql.raw(`
    INSERT OR IGNORE INTO treasury_alert_settings (
      id, forecast_horizon_days, reconciliation_min_pct, closing_cadence,
      negative_forecast_enabled, critical_tasks_enabled, reconciliation_enabled, closing_overdue_enabled
    ) VALUES (1, 30, 95, 'daily', 1, 1, 1, 1)
  `));
}
