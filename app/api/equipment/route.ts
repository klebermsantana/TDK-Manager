import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { getDb } from "@/db";
import { equipmentItems } from "@/db/schema";

const values = (p: Record<string, unknown>) => ({
  description: String(p.description ?? "").trim(),
  brand: String(p.brand ?? "").trim() || null,
  model: String(p.model ?? "").trim() || null,
  serialNumber: String(p.serialNumber ?? "").trim() || null,
  inventoryNumber: String(p.inventoryNumber ?? "").trim() || null,
  unit: String(p.unit ?? "un").trim() || "un",
  cost: Math.max(0, Number(p.cost) || 0),
});

const nextEquipmentCode = async () => {
  const rows = await getDb()
    .select({ code: equipmentItems.code })
    .from(equipmentItems);
  const highest = rows.reduce((max, row) => {
    const match = /^EQ-(\d+)$/.exec(row.code ?? "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `EQ-${String(highest + 1).padStart(4, "0")}`;
};

const ensureEquipmentCodes = async () => {
  const db = getDb();
  const rows = await db
    .select({ id: equipmentItems.id, code: equipmentItems.code })
    .from(equipmentItems)
    .orderBy(asc(equipmentItems.id));
  let highest = rows.reduce((max, row) => {
    const match = /^EQ-(\d+)$/.exec(row.code ?? "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  for (const row of rows) {
    if (row.code?.trim()) continue;
    highest += 1;
    await db
      .update(equipmentItems)
      .set({ code: `EQ-${String(highest).padStart(4, "0")}` })
      .where(eq(equipmentItems.id, row.id));
  }
};

export async function GET() {
  if (!(await getChatGPTUser()))
    return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  await ensureEquipmentCodes();
  return Response.json({
    equipment: await getDb()
      .select()
      .from(equipmentItems)
      .orderBy(asc(equipmentItems.description)),
  });
}
export async function POST(request: Request) {
  const denied = await requirePermission("sales");
  if (denied) return denied;
  await ensureEquipmentCodes();
  const item = values(await request.json());
  if (!item.description)
    return Response.json(
      { error: "Informe a descrição do equipamento ou peça." },
      { status: 400 },
    );
  const code = await nextEquipmentCode();
  const [created] = await getDb()
    .insert(equipmentItems)
    .values({ ...item, code })
    .returning();
  return Response.json({ item: created }, { status: 201 });
}
export async function PATCH(request: Request) {
  const denied = await requirePermission("sales");
  if (denied) return denied;
  const p = (await request.json()) as Record<string, unknown>,
    id = Number(p.id),
    item = values(p);
  if (!id || !item.description)
    return Response.json(
      { error: "Equipamento ou peça inválido." },
      { status: 400 },
    );
  const [updated] = await getDb()
    .update(equipmentItems)
    .set({ ...item, updatedAt: new Date().toISOString() })
    .where(eq(equipmentItems.id, id))
    .returning();
  return updated
    ? Response.json({ item: updated })
    : Response.json({ error: "Item não encontrado." }, { status: 404 });
}
export async function DELETE(request: Request) {
  const denied = await requirePermission("sales");
  if (denied) return denied;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "Item inválido." }, { status: 400 });
  await getDb().delete(equipmentItems).where(eq(equipmentItems.id, id));
  return Response.json({ success: true });
}
