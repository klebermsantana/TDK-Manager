import { desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { activities, opportunities } from "@/db/schema";

const validTypes = new Set(["ligacao", "reuniao", "visita", "proposta", "retorno", "outro"]);

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const rows = await getDb().select({
      id: activities.id,
      opportunityId: activities.opportunityId,
      opportunityTitle: opportunities.title,
      companyName: opportunities.companyName,
      type: activities.type,
      description: activities.description,
      dueAt: activities.dueAt,
      completedAt: activities.completedAt,
      createdAt: activities.createdAt,
    }).from(activities).innerJoin(opportunities, eq(activities.opportunityId, opportunities.id)).orderBy(desc(activities.createdAt));
    return Response.json({ activities: rows });
  } catch {
    return Response.json({ error: "Não foi possível carregar as atividades." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const opportunityId = Number(payload.opportunityId);
    const type = String(payload.type ?? "");
    const description = String(payload.description ?? "").trim();
    if (!opportunityId || !validTypes.has(type) || !description) return Response.json({ error: "Oportunidade, tipo e descrição são obrigatórios." }, { status: 400 });
    const [activity] = await getDb().insert(activities).values({ opportunityId, type, description, dueAt: payload.dueAt ? String(payload.dueAt) : null }).returning();
    const [opportunity] = await getDb().select({ title: opportunities.title, companyName: opportunities.companyName }).from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
    return Response.json({ activity: { ...activity, opportunityTitle: opportunity?.title ?? "Oportunidade", companyName: opportunity?.companyName ?? "Empresa" } }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível cadastrar a atividade." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    if (!id) return Response.json({ error: "Atividade inválida." }, { status: 400 });
    const [activity] = await getDb().update(activities).set({ completedAt: payload.completed ? new Date().toISOString() : null }).where(eq(activities.id, id)).returning();
    if (!activity) return Response.json({ error: "Atividade não encontrada." }, { status: 404 });
    return Response.json({ activity });
  } catch {
    return Response.json({ error: "Não foi possível atualizar a atividade." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "Atividade inválida." }, { status: 400 });
    const [activity] = await getDb().delete(activities).where(eq(activities.id, id)).returning();
    if (!activity) return Response.json({ error: "Atividade não encontrada." }, { status: 404 });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Não foi possível excluir a atividade." }, { status: 500 });
  }
}
