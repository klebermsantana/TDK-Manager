import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { GET as getClosingDiagnostics } from "@/app/api/treasury-closing/route";
import { ensureOfficialTreasuryClosingTables } from "@/app/treasury-closing-lock";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import { treasuryBankAccounts } from "@/db/treasury-schema";
import { treasuryClosingAudit, treasuryClosingRecords } from "@/db/treasury-closing-schema";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value: unknown) => String(value ?? "").trim();

async function loadDiagnostics(date: string) {
  const response = await getClosingDiagnostics(new Request(`http://tdk.local/api/treasury-closing?date=${encodeURIComponent(date)}`));
  const payload = await response.json() as any;
  return { response, payload };
}

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  try {
    await ensureOfficialTreasuryClosingTables();
    const db = getDb();
    const [records, audit] = await Promise.all([
      db.select({
        id: treasuryClosingRecords.id,
        bankAccountId: treasuryClosingRecords.bankAccountId,
        accountName: treasuryBankAccounts.name,
        bankName: treasuryBankAccounts.bankName,
        closingDate: treasuryClosingRecords.closingDate,
        status: treasuryClosingRecords.status,
        baseBalance: treasuryClosingRecords.baseBalance,
        ledgerNet: treasuryClosingRecords.ledgerNet,
        bookBalance: treasuryClosingRecords.bookBalance,
        statementNet: treasuryClosingRecords.statementNet,
        statementBalance: treasuryClosingRecords.statementBalance,
        closingDifference: treasuryClosingRecords.closingDifference,
        reconciliationCoverage: treasuryClosingRecords.reconciliationCoverage,
        unallocatedAmount: treasuryClosingRecords.unallocatedAmount,
        ledgerEventCount: treasuryClosingRecords.ledgerEventCount,
        statementTransactionCount: treasuryClosingRecords.statementTransactionCount,
        snapshotSource: treasuryClosingRecords.snapshotSource,
        notes: treasuryClosingRecords.notes,
        closedBy: treasuryClosingRecords.closedBy,
        closedAt: treasuryClosingRecords.closedAt,
        reopenedBy: treasuryClosingRecords.reopenedBy,
        reopenedAt: treasuryClosingRecords.reopenedAt,
        reopenReason: treasuryClosingRecords.reopenReason,
      }).from(treasuryClosingRecords)
        .innerJoin(treasuryBankAccounts, eq(treasuryClosingRecords.bankAccountId, treasuryBankAccounts.id))
        .orderBy(desc(treasuryClosingRecords.closingDate), desc(treasuryClosingRecords.id))
        .limit(100),
      db.select().from(treasuryClosingAudit).orderBy(desc(treasuryClosingAudit.createdAt), desc(treasuryClosingAudit.id)).limit(100),
    ]);
    const latestActiveByAccount = new Map<number, typeof records[number]>();
    for (const record of records.filter((item) => item.status === "closed")) {
      if (!latestActiveByAccount.has(record.bankAccountId)) latestActiveByAccount.set(record.bankAccountId, record);
    }
    return Response.json({ records, audit, latestActive: [...latestActiveByAccount.values()] });
  } catch {
    return Response.json({ error: "Não foi possível carregar os fechamentos oficiais." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureOfficialTreasuryClosingTables();
    const payload = await request.json() as Record<string, unknown>;
    const bankAccountId = Number(payload.bankAccountId);
    const closingDate = clean(payload.closingDate);
    const notes = clean(payload.notes) || null;
    if (!Number.isInteger(bankAccountId) || bankAccountId <= 0 || !datePattern.test(closingDate)) {
      return Response.json({ error: "Conta ou data de fechamento inválida." }, { status: 400 });
    }

    const db = getDb();
    const [account] = await db.select().from(treasuryBankAccounts).where(eq(treasuryBankAccounts.id, bankAccountId)).limit(1);
    if (!account || !account.active) return Response.json({ error: "Conta bancária ativa não encontrada." }, { status: 404 });

    const [latestActive] = await db.select().from(treasuryClosingRecords)
      .where(and(eq(treasuryClosingRecords.bankAccountId, bankAccountId), eq(treasuryClosingRecords.status, "closed")))
      .orderBy(desc(treasuryClosingRecords.closingDate), desc(treasuryClosingRecords.id)).limit(1);
    if (latestActive && closingDate <= latestActive.closingDate) {
      return Response.json({ error: `Esta conta já possui fechamento ativo até ${latestActive.closingDate}. Use uma data posterior ou reabra o fechamento atual.` }, { status: 409 });
    }

    const { response, payload: diagnostics } = await loadDiagnostics(closingDate);
    if (!response.ok) return Response.json({ error: diagnostics.error ?? "Não foi possível validar o fechamento." }, { status: response.status });
    const row = (diagnostics.accounts ?? []).find((item: any) => item.accountId === bankAccountId);
    if (!row) return Response.json({ error: "A conta não está disponível na conferência desta data." }, { status: 404 });
    if (!row.ready) return Response.json({ error: "A conta ainda não atende aos critérios para fechamento oficial.", issues: row.issues ?? [] }, { status: 409 });

    const snapshot = {
      bankAccountId,
      accountName: row.accountName,
      closingDate,
      baseBalance: Number(row.baseBalance),
      ledgerNet: Number(row.ledgerNet),
      bookBalance: Number(row.bookBalance),
      statementNet: Number(row.statementNet),
      statementBalance: Number(row.statementBalance),
      closingDifference: Number(row.closingDifference ?? 0),
      reconciliationCoverage: Number(row.reconciliationCoverage),
      unallocatedAmount: Number(row.unallocatedAmount),
      ledgerEventCount: Number(row.ledgerEventCount),
      statementTransactionCount: Number(row.statementTransactionCount),
      snapshotSource: String(row.statementBalanceSource ?? "movement"),
    };
    const now = new Date().toISOString();
    const [closing] = await db.insert(treasuryClosingRecords).values({
      bankAccountId,
      closingDate,
      status: "closed",
      baseBalance: snapshot.baseBalance,
      ledgerNet: snapshot.ledgerNet,
      bookBalance: snapshot.bookBalance,
      statementNet: snapshot.statementNet,
      statementBalance: snapshot.statementBalance,
      closingDifference: snapshot.closingDifference,
      reconciliationCoverage: snapshot.reconciliationCoverage,
      unallocatedAmount: snapshot.unallocatedAmount,
      ledgerEventCount: snapshot.ledgerEventCount,
      statementTransactionCount: snapshot.statementTransactionCount,
      snapshotSource: snapshot.snapshotSource,
      notes,
      closedBy: auth.email,
      closedAt: now,
      updatedAt: now,
    }).returning();
    await db.insert(treasuryClosingAudit).values({
      closingId: closing.id,
      bankAccountId,
      closingDate,
      action: "close",
      performedBy: auth.email,
      reason: notes,
      snapshotJson: JSON.stringify(snapshot),
    });
    return Response.json({ closing }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível registrar o fechamento oficial." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureOfficialTreasuryClosingTables();
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const reason = clean(payload.reason);
    if (!Number.isInteger(id) || id <= 0 || reason.length < 5) {
      return Response.json({ error: "Informe o fechamento e um motivo de reabertura com pelo menos 5 caracteres." }, { status: 400 });
    }
    const db = getDb();
    const [closing] = await db.select().from(treasuryClosingRecords).where(eq(treasuryClosingRecords.id, id)).limit(1);
    if (!closing || closing.status !== "closed") return Response.json({ error: "Fechamento ativo não encontrado." }, { status: 404 });
    const [latestActive] = await db.select().from(treasuryClosingRecords)
      .where(and(eq(treasuryClosingRecords.bankAccountId, closing.bankAccountId), eq(treasuryClosingRecords.status, "closed")))
      .orderBy(desc(treasuryClosingRecords.closingDate), desc(treasuryClosingRecords.id)).limit(1);
    if (!latestActive || latestActive.id !== closing.id) {
      return Response.json({ error: "Reabra primeiro o fechamento ativo mais recente desta conta." }, { status: 409 });
    }
    const now = new Date().toISOString();
    const [updated] = await db.update(treasuryClosingRecords).set({
      status: "reopened",
      reopenedBy: auth.email,
      reopenedAt: now,
      reopenReason: reason,
      updatedAt: now,
    }).where(eq(treasuryClosingRecords.id, id)).returning();
    await db.insert(treasuryClosingAudit).values({
      closingId: closing.id,
      bankAccountId: closing.bankAccountId,
      closingDate: closing.closingDate,
      action: "reopen",
      performedBy: auth.email,
      reason,
      snapshotJson: JSON.stringify({
        baseBalance: closing.baseBalance,
        ledgerNet: closing.ledgerNet,
        bookBalance: closing.bookBalance,
        statementNet: closing.statementNet,
        statementBalance: closing.statementBalance,
        closingDifference: closing.closingDifference,
      }),
    });
    return Response.json({ closing: updated });
  } catch {
    return Response.json({ error: "Não foi possível reabrir o fechamento." }, { status: 500 });
  }
}
