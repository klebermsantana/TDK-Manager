import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { getDb } from "@/db";
import {
  catalogItems,
  serviceCallEquipment,
  serviceCallExpenses,
  serviceCallMaterials,
  serviceCallServices,
} from "@/db/schema";

const tables = {
  service: serviceCallServices,
  material: serviceCallMaterials,
  equipment: serviceCallEquipment,
  expense: serviceCallExpenses,
};
export async function GET(request: Request) {
  if (!(await getChatGPTUser()))
    return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const serviceCallId = Number(
      new URL(request.url).searchParams.get("serviceCallId"),
    );
    if (!serviceCallId)
      return Response.json({ error: "Chamado inválido." }, { status: 400 });
    const [services, materials, equipment, expenses] = await Promise.all([
      getDb()
        .select()
        .from(serviceCallServices)
        .where(eq(serviceCallServices.serviceCallId, serviceCallId)),
      getDb()
        .select()
        .from(serviceCallMaterials)
        .where(eq(serviceCallMaterials.serviceCallId, serviceCallId)),
      getDb()
        .select()
        .from(serviceCallEquipment)
        .where(eq(serviceCallEquipment.serviceCallId, serviceCallId)),
      getDb()
        .select()
        .from(serviceCallExpenses)
        .where(eq(serviceCallExpenses.serviceCallId, serviceCallId)),
    ]);
    return Response.json({ services, materials, equipment, expenses });
  } catch {
    return Response.json(
      { error: "Não foi possível carregar os lançamentos do atendimento." },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  const denied = await requirePermission("sales");
  if (denied) return denied;
  if (!(await getChatGPTUser()))
    return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const p = (await request.json()) as Record<string, unknown>,
      type = String(p.type),
      serviceCallId = Number(p.serviceCallId),
      description = String(p.description ?? "").trim(),
      catalogId = Number(p.catalogId);
    if (!serviceCallId || !description || !(type in tables))
      return Response.json(
        { error: "Informe o tipo e a descrição do lançamento." },
        { status: 400 },
      );
    let entry;
    const expectedCategory =
      type === "service"
        ? "servico"
        : type === "material"
          ? "material"
          : type === "equipment"
            ? "equipamento"
            : null;
    let catalogItem: typeof catalogItems.$inferSelect | undefined;
    if (expectedCategory) {
      if (!catalogId)
        return Response.json(
          { error: "Selecione um item previamente cadastrado no catálogo." },
          { status: 400 },
        );
      [catalogItem] = await getDb()
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, catalogId))
        .limit(1);
      if (
        !catalogItem ||
        !catalogItem.active ||
        catalogItem.category !== expectedCategory
      )
        return Response.json(
          { error: "O item selecionado não está disponível nesta categoria." },
          { status: 400 },
        );
    }
    if (type === "service")
      [entry] = await getDb()
        .insert(serviceCallServices)
        .values({
          serviceCallId,
          catalogId,
          description: catalogItem!.description,
          quantity: Math.max(0.01, Number(p.quantity) || 1),
          unit: catalogItem!.unit,
          technician: String(p.technician ?? "").trim() || null,
          notes: String(p.notes ?? "").trim() || null,
        })
        .returning();
    else if (type === "material")
      [entry] = await getDb()
        .insert(serviceCallMaterials)
        .values({
          serviceCallId,
          catalogId,
          description: catalogItem!.description,
          quantity: Math.max(0.01, Number(p.quantity) || 1),
          unit: catalogItem!.unit,
          unitCost: catalogItem!.cost,
        })
        .returning();
    else if (type === "equipment")
      [entry] = await getDb()
        .insert(serviceCallEquipment)
        .values({
          serviceCallId,
          catalogId,
          description: catalogItem!.description,
          brandModel: String(p.brandModel ?? "").trim() || null,
          quantity: Math.max(0.01, Number(p.quantity) || 1),
          removedSerial: String(p.removedSerial ?? "").trim() || null,
          installedSerial: String(p.installedSerial ?? "").trim() || null,
          reason: String(p.reason ?? "").trim() || null,
        })
        .returning();
    else
      [entry] = await getDb()
        .insert(serviceCallExpenses)
        .values({
          serviceCallId,
          category: String(p.category ?? "outros"),
          description,
          amount: Math.max(0, Number(p.amount) || 0),
          expenseDate: String(
            p.expenseDate ?? new Date().toISOString().slice(0, 10),
          ),
        })
        .returning();
    return Response.json({ entry }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Não foi possível adicionar o lançamento." },
      { status: 500 },
    );
  }
}
export async function DELETE(request: Request) {
  const denied = await requirePermission("sales");
  if (denied) return denied;
  try {
    const url = new URL(request.url),
      type = url.searchParams.get("type") ?? "",
      id = Number(url.searchParams.get("id"));
    if (!id || !(type in tables))
      return Response.json({ error: "Lançamento inválido." }, { status: 400 });
    if (type === "service")
      await getDb()
        .delete(serviceCallServices)
        .where(eq(serviceCallServices.id, id));
    else if (type === "material")
      await getDb()
        .delete(serviceCallMaterials)
        .where(eq(serviceCallMaterials.id, id));
    else if (type === "equipment")
      await getDb()
        .delete(serviceCallEquipment)
        .where(eq(serviceCallEquipment.id, id));
    else
      await getDb()
        .delete(serviceCallExpenses)
        .where(eq(serviceCallExpenses.id, id));
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Não foi possível excluir o lançamento." },
      { status: 500 },
    );
  }
}
