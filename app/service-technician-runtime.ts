import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function ensureServiceTechnicianTables() {
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      supplier_id INTEGER,
      name TEXT NOT NULL,
      document TEXT,
      email TEXT,
      phone TEXT,
      relationship_type TEXT NOT NULL DEFAULT 'freelancer',
      financial_mode TEXT NOT NULL DEFAULT 'per_service',
      payment_method TEXT,
      pix_key TEXT,
      due_days INTEGER NOT NULL DEFAULT 7,
      requires_invoice INTEGER NOT NULL DEFAULT 0,
      monthly_cost REAL,
      monthly_productive_hours REAL NOT NULL DEFAULT 160,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technicians_active ON service_technicians(active, name)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technicians_relationship ON service_technicians(relationship_type, financial_mode)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technicians_user ON service_technicians(user_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technicians_supplier ON service_technicians(supplier_id)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_technician_rate_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER,
      company_id INTEGER,
      service_type TEXT,
      region TEXT,
      remuneration_type TEXT NOT NULL DEFAULT 'per_visit',
      amount REAL NOT NULL DEFAULT 0,
      minimum_hours REAL NOT NULL DEFAULT 0,
      night_surcharge_pct REAL NOT NULL DEFAULT 0,
      weekend_surcharge_pct REAL NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 0,
      effective_from TEXT,
      effective_to TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES service_technicians(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_rates_tech ON service_technician_rate_rules(technician_id, active)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_rates_context ON service_technician_rate_rules(company_id, service_type, active)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_rates_effective ON service_technician_rate_rules(effective_from, effective_to)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_call_technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_call_id INTEGER NOT NULL,
      technician_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'primary',
      assignment_status TEXT NOT NULL DEFAULT 'assigned',
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      hours REAL NOT NULL DEFAULT 1,
      quantity REAL NOT NULL DEFAULT 1,
      equipment_qty REAL NOT NULL DEFAULT 0,
      negotiated_amount REAL,
      rate_rule_id INTEGER,
      remuneration_type_snapshot TEXT,
      rate_amount_snapshot REAL,
      surcharge_amount REAL NOT NULL DEFAULT 0,
      reimbursement_amount REAL NOT NULL DEFAULT 0,
      expected_cost REAL NOT NULL DEFAULT 0,
      realized_cost REAL,
      cost_nature TEXT NOT NULL DEFAULT 'payable',
      apportionment_status TEXT NOT NULL DEFAULT 'planned',
      approved_by TEXT,
      approved_at TEXT,
      payable_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (service_call_id) REFERENCES service_calls(id) ON DELETE CASCADE,
      FOREIGN KEY (technician_id) REFERENCES service_technicians(id),
      FOREIGN KEY (rate_rule_id) REFERENCES service_technician_rate_rules(id) ON DELETE SET NULL,
      FOREIGN KEY (payable_id) REFERENCES payables(id) ON DELETE SET NULL
    )
  `));
  await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS uq_service_call_technician ON service_call_technicians(service_call_id, technician_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_call_technicians_call ON service_call_technicians(service_call_id, assignment_status)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_call_technicians_tech ON service_call_technicians(technician_id, apportionment_status)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_call_technicians_payable ON service_call_technicians(payable_id)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_technician_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER,
      assignment_id INTEGER,
      service_call_id INTEGER,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES service_technicians(id) ON DELETE SET NULL,
      FOREIGN KEY (assignment_id) REFERENCES service_call_technicians(id) ON DELETE SET NULL,
      FOREIGN KEY (service_call_id) REFERENCES service_calls(id) ON DELETE SET NULL
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_audit_tech ON service_technician_audit(technician_id, created_at)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_audit_assignment ON service_technician_audit(assignment_id, created_at)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_technician_audit_call ON service_technician_audit(service_call_id, created_at)`));
}
