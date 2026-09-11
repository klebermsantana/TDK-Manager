import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export function todaySaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isDateKey(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

export function ledgerSourceKey(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export async function ensureFinancialLedger() {
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_financial_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movement_type TEXT NOT NULL,
      movement_id INTEGER NOT NULL,
      direction TEXT NOT NULL,
      event_type TEXT NOT NULL,
      amount REAL NOT NULL,
      event_date TEXT NOT NULL,
      source TEXT NOT NULL,
      source_key TEXT NOT NULL,
      bank_account_id INTEGER,
      statement_transaction_id INTEGER,
      performed_by TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES treasury_bank_accounts(id) ON DELETE SET NULL,
      FOREIGN KEY (statement_transaction_id) REFERENCES treasury_statement_transactions(id) ON DELETE SET NULL
    )
  `));
  await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_financial_event_source ON treasury_financial_events(source_key)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_financial_event_movement_date ON treasury_financial_events(movement_type, movement_id, event_date)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_financial_event_account_date ON treasury_financial_events(bank_account_id, event_date)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_financial_event_statement ON treasury_financial_events(statement_transaction_id)`));

  await db.run(sql.raw(`
    INSERT OR IGNORE INTO treasury_financial_events
      (movement_type, movement_id, direction, event_type, amount, event_date, source, source_key,
       bank_account_id, statement_transaction_id, performed_by, notes, created_at)
    SELECT a.movement_type,
      a.movement_id,
      CASE WHEN a.movement_type = 'payable' THEN 'outflow' ELSE 'inflow' END,
      CASE WHEN a.action = 'reverse' THEN 'reversal' ELSE 'payment' END,
      CASE WHEN a.action = 'reverse' THEN -ABS(a.amount) ELSE ABS(a.amount) END,
      a.payment_date,
      'reconciliation',
      'reconciliation:audit:' || a.id,
      a.bank_account_id,
      a.statement_transaction_id,
      a.performed_by,
      CASE WHEN a.action = 'reverse' THEN 'Estorno originado pela conciliação bancária' ELSE 'Baixa originada pela conciliação bancária' END,
      a.created_at
    FROM treasury_reconciliation_audit a
    WHERE a.action IN ('settle', 'reverse')
      AND a.movement_type IN ('receivable', 'payable')
  `));

  await db.run(sql.raw(`
    INSERT OR IGNORE INTO treasury_financial_events
      (movement_type, movement_id, direction, event_type, amount, event_date, source, source_key, performed_by, notes)
    SELECT 'receivable', r.id, 'inflow', 'legacy_snapshot', r.received_amount, r.payment_date,
      'legacy_snapshot', 'legacy:receivable:' || r.id, 'migração',
      'Snapshot acumulado anterior ao razão por eventos'
    FROM receivables r
    WHERE r.received_amount > 0
      AND r.payment_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM treasury_financial_events e
        WHERE e.movement_type = 'receivable' AND e.movement_id = r.id
      )
  `));

  await db.run(sql.raw(`
    INSERT OR IGNORE INTO treasury_financial_events
      (movement_type, movement_id, direction, event_type, amount, event_date, source, source_key, performed_by, notes)
    SELECT 'payable', p.id, 'outflow', 'legacy_snapshot', p.paid_amount, p.payment_date,
      'legacy_snapshot', 'legacy:payable:' || p.id, 'migração',
      'Snapshot acumulado anterior ao razão por eventos'
    FROM payables p
    WHERE p.paid_amount > 0
      AND p.payment_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM treasury_financial_events e
        WHERE e.movement_type = 'payable' AND e.movement_id = p.id
      )
  `));
}
