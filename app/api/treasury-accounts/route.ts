import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { treasuryBankAccounts } from "@/db/treasury-schema";
import { ensureTreasuryTables, requireTreasuryAccess } from "@/app/treasury-runtime";

const validTypes = new Set(["checking", "savings", "cash", "investment", "other"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);
const cleanText = (value: unknown) => String(value ?? "").trim() || null;

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  try {
    await ensureTreasuryTables();
    const accounts = await getDb()
      .select()
      .from(treasuryBankAccounts)
      .orderBy(desc(treasuryBankAccounts.active), asc(treasuryBankAccounts.name));
    return Response.json({ accounts });
  } catch {
    return Response.json({ error: "Não foi possível carregar as contas da tesouraria." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  try {
    await ensureTreasuryTables();
    const payload = await request.json() as Record<string, unknown>;
    const name = String(payload.name ?? "").trim();
    const accountType = String(payload.accountType ?? "checking");
    const openingBalance = Number(payload.openingBalance ?? 0);
    const currentBalance = payload.currentBalance === "" || payload.currentBalance === undefined
      ? openingBalance
      : Number(payload.currentBalance);
    const openingDate = String(payload.openingDate ?? today());
    const balanceDate = String(payload.balanceDate ?? openingDate);

    if (!name || !validTypes.has(accountType) || !Number.isFinite(openingBalance) || !Number.isFinite(currentBalance) || !datePattern.test(openingDate) || !datePattern.test(balanceDate) || balanceDate < openingDate) {
      return Response.json({ error: "Revise o nome, os saldos e as datas da conta." }, { status: 400 });
    }

    const [account] = await getDb().insert(treasuryBankAccounts).values({
      name,
      bankName: cleanText(payload.bankName),
      accountType,
      agency: cleanText(payload.agency),
      accountNumber: cleanText(payload.accountNumber),
      openingBalance,
      openingDate,
      currentBalance,
      balanceDate,
      active: payload.active !== false,
      notes: cleanText(payload.notes),
    }).returning();
    return Response.json({ account }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível cadastrar a conta bancária." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  try {
    await ensureTreasuryTables();
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Conta inválida." }, { status: 400 });

    const db = getDb();
    const [existing] = await db.select().from(treasuryBankAccounts).where(eq(treasuryBankAccounts.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Conta bancária não encontrada." }, { status: 404 });

    const name = String(payload.name ?? existing.name).trim();
    const accountType = String(payload.accountType ?? existing.accountType);
    const openingBalance = payload.openingBalance === undefined ? existing.openingBalance : Number(payload.openingBalance);
    const currentBalance = payload.currentBalance === undefined ? existing.currentBalance : Number(payload.currentBalance);
    const openingDate = String(payload.openingDate ?? existing.openingDate);
    const balanceDate = String(payload.balanceDate ?? existing.balanceDate);

    if (!name || !validTypes.has(accountType) || !Number.isFinite(openingBalance) || !Number.isFinite(currentBalance) || !datePattern.test(openingDate) || !datePattern.test(balanceDate) || balanceDate < openingDate) {
      return Response.json({ error: "Revise o nome, os saldos e as datas da conta." }, { status: 400 });
    }

    const [account] = await db.update(treasuryBankAccounts).set({
      name,
      bankName: payload.bankName === undefined ? existing.bankName : cleanText(payload.bankName),
      accountType,
      agency: payload.agency === undefined ? existing.agency : cleanText(payload.agency),
      accountNumber: payload.accountNumber === undefined ? existing.accountNumber : cleanText(payload.accountNumber),
      openingBalance,
      openingDate,
      currentBalance,
      balanceDate,
      active: payload.active === undefined ? existing.active : payload.active !== false,
      notes: payload.notes === undefined ? existing.notes : cleanText(payload.notes),
      updatedAt: new Date().toISOString(),
    }).where(eq(treasuryBankAccounts.id, id)).returning();

    return Response.json({ account });
  } catch {
    return Response.json({ error: "Não foi possível atualizar a conta bancária." }, { status: 500 });
  }
}
