import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { receivables } from "@/db/schema";
import { treasuryMovementAccounts } from "@/db/treasury-schema";
import { treasuryClosingRecords } from "@/db/treasury-closing-schema";

export async function ensureOfficialTreasuryClosingTables() {
  const { ensureTreasuryTables } = await import("@/app/treasury-runtime");
  const { ensureFinancialLedger } = await import("@/app/financial-ledger");
  await ensureTreasuryTables();
  await ensureFinancialLedger();

  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_closing_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_account_id INTEGER NOT NULL,
      closing_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'closed',
      base_balance REAL NOT NULL,
      ledger_net REAL NOT NULL,
      book_balance REAL NOT NULL,
      statement_net REAL NOT NULL,
      statement_balance REAL NOT NULL,
      closing_difference REAL NOT NULL DEFAULT 0,
      reconciliation_coverage REAL NOT NULL DEFAULT 100,
      unallocated_amount REAL NOT NULL DEFAULT 0,
      ledger_event_count INTEGER NOT NULL DEFAULT 0,
      statement_transaction_count INTEGER NOT NULL DEFAULT 0,
      snapshot_source TEXT NOT NULL DEFAULT 'movement',
      notes TEXT,
      closed_by TEXT NOT NULL,
      closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reopened_by TEXT,
      reopened_at TEXT,
      reopen_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES treasury_bank_accounts(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_closing_account_date ON treasury_closing_records(bank_account_id, closing_date)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_closing_status_date ON treasury_closing_records(status, closing_date)`));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_closing_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      closing_id INTEGER NOT NULL,
      bank_account_id INTEGER NOT NULL,
      closing_date TEXT NOT NULL,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      reason TEXT,
      snapshot_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (closing_id) REFERENCES treasury_closing_records(id) ON DELETE CASCADE,
      FOREIGN KEY (bank_account_id) REFERENCES treasury_bank_accounts(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_closing_audit_closing ON treasury_closing_audit(closing_id, created_at)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_closing_audit_account ON treasury_closing_audit(bank_account_id, created_at)`));

  const guardMessage = "TREASURY_CLOSED_PERIOD: reabra o fechamento oficial antes de alterar este periodo";
  await db.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_treasury_financial_events_closed_insert
    BEFORE INSERT ON treasury_financial_events
    WHEN EXISTS (
      SELECT 1 FROM treasury_closing_records c
      WHERE c.status = 'closed'
        AND c.closing_date >= NEW.event_date
        AND (NEW.bank_account_id IS NULL OR c.bank_account_id = NEW.bank_account_id)
    )
    BEGIN SELECT RAISE(ABORT, '${guardMessage}'); END
  `));
  await db.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_treasury_statement_imports_closed_insert
    BEFORE INSERT ON treasury_statement_imports
    WHEN EXISTS (
      SELECT 1 FROM treasury_closing_records c
      WHERE c.status = 'closed'
        AND c.bank_account_id = NEW.bank_account_id
        AND NEW.period_start IS NOT NULL
        AND c.closing_date >= NEW.period_start
    )
    BEGIN SELECT RAISE(ABORT, '${guardMessage}'); END
  `));
  await db.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_treasury_statement_transactions_closed_update
    BEFORE UPDATE ON treasury_statement_transactions
    WHEN EXISTS (
      SELECT 1 FROM treasury_closing_records c
      WHERE c.status = 'closed'
        AND c.bank_account_id = OLD.bank_account_id
        AND c.closing_date >= OLD.transaction_date
    )
    BEGIN SELECT RAISE(ABORT, '${guardMessage}'); END
  `));
  await db.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_treasury_reconciliation_allocations_closed_insert
    BEFORE INSERT ON treasury_reconciliation_allocations
    WHEN EXISTS (
      SELECT 1 FROM treasury_closing_records c
      JOIN treasury_statement_transactions t ON t.id = NEW.statement_transaction_id
      WHERE c.status = 'closed' AND c.bank_account_id = NEW.bank_account_id AND c.closing_date >= t.transaction_date
    )
    BEGIN SELECT RAISE(ABORT, '${guardMessage}'); END
  `));
  await db.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_treasury_reconciliation_allocations_closed_update
    BEFORE UPDATE ON treasury_reconciliation_allocations
    WHEN EXISTS (
      SELECT 1 FROM treasury_closing_records c
      JOIN treasury_statement_transactions t ON t.id = OLD.statement_transaction_id
      WHERE c.status = 'closed' AND c.bank_account_id = OLD.bank_account_id AND c.closing_date >= t.transaction_date
    )
    BEGIN SELECT RAISE(ABORT, '${guardMessage}'); END
  `));
  await db.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_treasury_reconciliation_allocations_closed_delete
    BEFORE DELETE ON treasury_reconciliation_allocations
    WHEN EXISTS (
      SELECT 1 FROM treasury_closing_records c
      JOIN treasury_statement_transactions t ON t.id = OLD.statement_transaction_id
      WHERE c.status = 'closed' AND c.bank_account_id = OLD.bank_account_id AND c.closing_date >= t.transaction_date
    )
    BEGIN SELECT RAISE(ABORT, '${guardMessage}'); END
  `));
  await db.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_treasury_reconciliation_settlements_closed_insert
    BEFORE INSERT ON treasury_reconciliation_settlements
    WHEN EXISTS (
      SELECT 1 FROM treasury_closing_records c
      JOIN treasury_statement_transactions t ON t.id = NEW.statement_transaction_id
      WHERE c.status = 'closed' AND c.bank_account_id = NEW.bank_account_id AND c.closing_date >= t.transaction_date
    )
    BEGIN SELECT RAISE(ABORT, '${guardMessage}'); END
  `));
  await db.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_treasury_reconciliation_settlements_closed_delete
    BEFORE DELETE ON treasury_reconciliation_settlements
    WHEN EXISTS (
      SELECT 1 FROM treasury_closing_records c
      JOIN treasury_statement_transactions t ON t.id = OLD.statement_transaction_id
      WHERE c.status = 'closed' AND c.bank_account_id = OLD.bank_account_id AND c.closing_date >= t.transaction_date
    )
    BEGIN SELECT RAISE(ABORT, '${guardMessage}'); END
  `));
  await db.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_treasury_movement_accounts_closed_insert
    BEFORE INSERT ON treasury_movement_accounts
    WHEN EXISTS (
      SELECT 1 FROM treasury_financial_events e
      JOIN treasury_closing_records c ON c.bank_account_id = NEW.bank_account_id
      WHERE c.status = 'closed'
        AND e.movement_type = NEW.movement_type
        AND e.movement_id = NEW.movement_id
        AND c.closing_date >= e.event_date
    )
    BEGIN SELECT RAISE(ABORT, '${guardMessage}'); END
  `));
  await db.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_treasury_movement_accounts_closed_update
    BEFORE UPDATE ON treasury_movement_accounts
    WHEN EXISTS (
      SELECT 1 FROM treasury_financial_events e
      JOIN treasury_closing_records c ON c.status = 'closed'
      WHERE e.movement_type = OLD.movement_type
        AND e.movement_id = OLD.movement_id
        AND c.closing_date >= e.event_date
        AND c.bank_account_id IN (OLD.bank_account_id, NEW.bank_account_id)
    )
    BEGIN SELECT RAISE(ABORT, '${guardMessage}'); END
  `));
  await db.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_treasury_movement_accounts_closed_delete
    BEFORE DELETE ON treasury_movement_accounts
    WHEN EXISTS (
      SELECT 1 FROM treasury_financial_events e
      JOIN treasury_closing_records c ON c.bank_account_id = OLD.bank_account_id
      WHERE c.status = 'closed'
        AND e.movement_type = OLD.movement_type
        AND e.movement_id = OLD.movement_id
        AND c.closing_date >= e.event_date
    )
    BEGIN SELECT RAISE(ABORT, '${guardMessage}'); END
  `));
  await db.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_treasury_bank_accounts_closed_balance_update
    BEFORE UPDATE ON treasury_bank_accounts
    WHEN (NEW.current_balance <> OLD.current_balance OR NEW.balance_date <> OLD.balance_date OR NEW.opening_balance <> OLD.opening_balance OR NEW.opening_date <> OLD.opening_date)
      AND EXISTS (
        SELECT 1 FROM treasury_closing_records c
        WHERE c.status = 'closed' AND c.bank_account_id = OLD.id AND c.closing_date >= NEW.balance_date
      )
    BEGIN SELECT RAISE(ABORT, '${guardMessage}'); END
  `));
}

export async function findBlockingClosing(bankAccountId: number | null, eventDate: string) {
  await ensureOfficialTreasuryClosingTables();
  const db = getDb();
  const conditions = [eq(treasuryClosingRecords.status, "closed"), gte(treasuryClosingRecords.closingDate, eventDate)];
  if (bankAccountId) conditions.push(eq(treasuryClosingRecords.bankAccountId, bankAccountId));
  const [closing] = await db.select().from(treasuryClosingRecords)
    .where(and(...conditions))
    .orderBy(desc(treasuryClosingRecords.closingDate), desc(treasuryClosingRecords.id))
    .limit(1);
  return closing ?? null;
}

export async function resolveMovementBankAccount(movementType: string, movementId: number) {
  const db = getDb();
  const [direct] = await db.select().from(treasuryMovementAccounts)
    .where(and(eq(treasuryMovementAccounts.movementType, movementType), eq(treasuryMovementAccounts.movementId, movementId)))
    .limit(1);
  if (direct) return direct.bankAccountId;
  if (movementType === "receivable") {
    const [row] = await db.select({ billingId: receivables.billingId }).from(receivables).where(eq(receivables.id, movementId)).limit(1);
    if (row) {
      const [billingAllocation] = await db.select().from(treasuryMovementAccounts)
        .where(and(eq(treasuryMovementAccounts.movementType, "billing"), eq(treasuryMovementAccounts.movementId, row.billingId)))
        .limit(1);
      if (billingAllocation) return billingAllocation.bankAccountId;
    }
  }
  return null;
}

export async function closedPeriodResponse(bankAccountId: number | null, eventDate: string, action = "alterar este período") {
  const closing = await findBlockingClosing(bankAccountId, eventDate);
  if (!closing) return null;
  return Response.json({
    error: `Período oficialmente fechado até ${closing.closingDate}. Reabra o fechamento da tesouraria antes de ${action}.`,
    closingId: closing.id,
    closingDate: closing.closingDate,
    bankAccountId: closing.bankAccountId,
  }, { status: 423 });
}

export async function movementClosedPeriodResponse(movementType: string, movementId: number, eventDate: string, action?: string) {
  const bankAccountId = await resolveMovementBankAccount(movementType, movementId);
  return closedPeriodResponse(bankAccountId, eventDate, action);
}
