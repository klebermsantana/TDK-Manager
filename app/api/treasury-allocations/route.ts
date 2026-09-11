import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { treasuryBankAccounts, treasuryMovementAccounts } from "@/db/treasury-schema";
import { ensureTreasuryTables, requireTreasuryAccess } from "@/app/treasury-runtime";

const validMovementTypes = new Set(["receivable", "billing", "payable"]);

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  try {
    await ensureTreasuryTables();
    const allocations = await getDb()
      .select()
      .from(treasuryMovementAccounts)
      .orderBy(asc(treasuryMovementAccounts.movementType), asc(treasuryMovementAccounts.movementId));
    return Response.json({ allocations });
  } catch {
    return Response.json({ error: "Não foi possível carregar as vinculações bancárias." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  try {
    await ensureTreasuryTables();
    const payload = await request.json() as Record<string, unknown>;
    const movementType = String(payload.movementType ?? "");
    const movementId = Number(payload.movementId);
    const bankAccountId = payload.bankAccountId === null || payload.bankAccountId === "" ? null : Number(payload.bankAccountId);

    if (!validMovementTypes.has(movementType) || !Number.isInteger(movementId) || movementId <= 0 || (bankAccountId !== null && (!Number.isInteger(bankAccountId) || bankAccountId <= 0))) {
      return Response.json({ error: "Movimento ou conta inválidos." }, { status: 400 });
    }

    const db = getDb();
    const whereMovement = and(
      eq(treasuryMovementAccounts.movementType, movementType),
      eq(treasuryMovementAccounts.movementId, movementId),
    );
    const [existing] = await db.select().from(treasuryMovementAccounts).where(whereMovement).limit(1);

    if (bankAccountId === null) {
      if (existing) await db.delete(treasuryMovementAccounts).where(eq(treasuryMovementAccounts.id, existing.id));
      return Response.json({ allocation: null });
    }

    const [account] = await db.select().from(treasuryBankAccounts).where(eq(treasuryBankAccounts.id, bankAccountId)).limit(1);
    if (!account || !account.active) return Response.json({ error: "Selecione uma conta bancária ativa." }, { status: 400 });

    if (existing) {
      const [allocation] = await db.update(treasuryMovementAccounts).set({
        bankAccountId,
        updatedAt: new Date().toISOString(),
      }).where(eq(treasuryMovementAccounts.id, existing.id)).returning();
      return Response.json({ allocation });
    }

    const [allocation] = await db.insert(treasuryMovementAccounts).values({
      movementType,
      movementId,
      bankAccountId,
    }).returning();
    return Response.json({ allocation }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível vincular o movimento à conta bancária." }, { status: 500 });
  }
}
