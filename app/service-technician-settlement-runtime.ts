import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureServiceTechnicianTables } from "@/app/service-technician-runtime";

export async function ensureServiceTechnicianSettlementTables() {
  await ensureServiceTechnicianTables();
  const db = getDb();

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_technician_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER NOT NULL,
      supplier_id INTEGER,
      period_from TEXT NOT NULL,
      period_to TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      invoice_number TEXT,
      invoice_date TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      reimbursement_total REAL NOT NULL DEFAULT 0,
      adjustment_total REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      item_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      submitted_by TEXT,
      submitted_at TEXT,
      approved_by TEXT,
      approved_at TEXT,
      due_date TEXT,
      payable_id INTEGER,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES service_technicians(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
      FOREIGN KEY (payable_id) REFERENCES payables(id) ON DELETE SET NULL
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_settlements_tech ON service_technician_settlements(technician_id, status)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_settlements_period ON service_technician_settlements(period_from, period_to)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_settlements_payable ON service_technician_settlements(payable_id)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_technician_settlement_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_id INTEGER NOT NULL,
      assignment_id INTEGER NOT NULL,
      service_call_id INTEGER NOT NULL,
      approved_amount_snapshot REAL NOT NULL DEFAULT 0,
      reimbursement_snapshot REAL NOT NULL DEFAULT 0,
      settlement_amount REAL NOT NULL DEFAULT 0,
      divergence_amount REAL NOT NULL DEFAULT 0,
      divergence_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (settlement_id) REFERENCES service_technician_settlements(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES service_call_technicians(id),
      FOREIGN KEY (service_call_id) REFERENCES service_calls(id)
    )
  `));
  await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS uq_service_technician_settlement_item ON service_technician_settlement_items(settlement_id, assignment_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_settlement_items_assignment ON service_technician_settlement_items(assignment_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_settlement_items_call ON service_technician_settlement_items(service_call_id)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_technician_settlement_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_id INTEGER,
      item_id INTEGER,
      technician_id INTEGER,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      note TEXT,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (settlement_id) REFERENCES service_technician_settlements(id) ON DELETE SET NULL,
      FOREIGN KEY (item_id) REFERENCES service_technician_settlement_items(id) ON DELETE SET NULL,
      FOREIGN KEY (technician_id) REFERENCES service_technicians(id) ON DELETE SET NULL
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_settlement_audit_settlement ON service_technician_settlement_audit(settlement_id, created_at)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_settlement_audit_tech ON service_technician_settlement_audit(technician_id, created_at)`));
}
