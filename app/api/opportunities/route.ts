import { desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { opportunities } from "@/db/schema";

const validStages = new Set(["novo", "qualificacao", "proposta", "negociacao", "ganho"]);

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const rows = await getDb().select().from(opportunities).orderBy(desc(opportunities.updatedAt)).limit(200);
    return Response.json({ opportunities: rows });
  } catch {
    return Response.json({ error: "Não foi possível carregar as oportunidades." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const title = String(payload.title ?? "").trim();
    const companyName = String(payload.companyName ?? "").trim();
    const companyId = payload.companyId ? Number(payload.companyId) : null;
    const value = Number(payload.value ?? 0);
    if (!title || !companyName) return Response.json({ error: "Oportunidade e empresa são obrigatórias." }, { status: 400 });
    if (!Number.isFinite(value) || value < 0) return Response.json({ error: "Informe um valor estimado válido." }, { status: 400 });
    const [row] = await getDb().insert(opportunities).values({
      title,
      companyId,
      companyName,
      value,
      stage: "novo",
      ownerName: user.fullName ?? user.email,
      expectedCloseAt: payload.expectedCloseAt ? String(payload.expectedCloseAt) : null,
    }).returning();
    return Response.json({ opportunity: row }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível cadastrar a oportunidade." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const stage = String(payload.stage ?? "");
    if (!id) return Response.json({ error: "Oportunidade inválida." }, { status: 400 });
    if (stage && !validStages.has(stage)) return Response.json({ error: "Etapa da oportunidade inválida." }, { status: 400 });
    const changes: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (stage) changes.stage = stage;
    if (payload.title !== undefined) {
      const title = String(payload.title).trim();
      const companyName = String(payload.companyName ?? "").trim();
      const value = Number(payload.value ?? 0);
      if (!title || !companyName || !Number.isFinite(value) || value < 0) return Response.json({ error: "Revise os dados da oportunidade." }, { status: 400 });
      Object.assign(changes, { title, companyId: Number(payload.companyId) || null, companyName, value, expectedCloseAt: payload.expectedCloseAt ? String(payload.expectedCloseAt) : null });
    }
    const [row] = await getDb().update(opportunities)
      .set(changes)
      .where(eq(opportunities.id, id))
      .returning();
    if (!row) return Response.json({ error: "Oportunidade não encontrada." }, { status: 404 });
    return Response.json({ opportunity: row });
  } catch {
    return Response.json({ error: "Não foi possível atualizar a oportunidade." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "Oportunidade inválida." }, { status: 400 });
    const [row] = await getDb().delete(opportunities).where(eq(opportunities.id, id)).returning();
    if (!row) return Response.json({ error: "Oportunidade não encontrada." }, { status: 404 });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Não foi possível excluir a oportunidade." }, { status: 500 });
  }
}
