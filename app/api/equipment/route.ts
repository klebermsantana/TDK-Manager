import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { getDb } from "@/db";
import { equipmentItems } from "@/db/schema";

const values = (p: Record<string, unknown>) => ({
  code: String(p.code ?? "").trim() || null,
  description: String(p.description ?? "").trim(),
  brand: String(p.brand ?? "").trim() || null,
  model: String(p.model ?? "").trim() || null,
  unit: String(p.unit ?? "un").trim() || "un",
  cost: Math.max(0, Number(p.cost) || 0),
});

export async function GET() {
  if (!(await getChatGPTUser())) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  return Response.json({ equipment: await getDb().select().from(equipmentItems).orderBy(asc(equipmentItems.description)) });
}
export async function POST(request: Request) {
  const denied = await requirePermission("sales"); if (denied) return denied;
  const item = values(await request.json());
  if (!item.description) return Response.json({ error: "Informe a descrição do equipamento ou peça." }, { status: 400 });
  const [created] = await getDb().insert(equipmentItems).values(item).returning();
  return Response.json({ item: created }, { status: 201 });
}
export async function PATCH(request: Request) {
  const denied = await requirePermission("sales"); if (denied) return denied;
  const p = await request.json() as Record<string, unknown>, id = Number(p.id), item = values(p);
  if (!id || !item.description) return Response.json({ error: "Equipamento ou peça inválido." }, { status: 400 });
  const [updated] = await getDb().update(equipmentItems).set({ ...item, updatedAt: new Date().toISOString() }).where(eq(equipmentItems.id, id)).returning();
  return updated ? Response.json({ item: updated }) : Response.json({ error: "Item não encontrado." }, { status: 404 });
}
export async function DELETE(request: Request) {
  const denied = await requirePermission("sales"); if (denied) return denied;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "Item inválido." }, { status: 400 });
  await getDb().delete(equipmentItems).where(eq(equipmentItems.id, id));
  return Response.json({ success: true });
}
