import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { companies } from "@/db/schema";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    return Response.json({ companies: await getDb().select().from(companies).orderBy(asc(companies.name)) });
  } catch {
    return Response.json({ error: "Não foi possível carregar as empresas." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const name = String(payload.name ?? "").trim();
    if (!name) return Response.json({ error: "O nome da empresa é obrigatório." }, { status: 400 });
    const [company] = await getDb().insert(companies).values({
      name,
      document: String(payload.document ?? "").trim() || null,
      segment: String(payload.segment ?? "").trim() || null,
    }).returning();
    return Response.json({ company }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível cadastrar a empresa." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const name = String(payload.name ?? "").trim();
    if (!id || !name) return Response.json({ error: "Empresa inválida." }, { status: 400 });
    const [company] = await getDb().update(companies).set({
      name,
      document: String(payload.document ?? "").trim() || null,
      segment: String(payload.segment ?? "").trim() || null,
    }).where(eq(companies.id, id)).returning();
    if (!company) return Response.json({ error: "Empresa não encontrada." }, { status: 404 });
    return Response.json({ company });
  } catch {
    return Response.json({ error: "Não foi possível atualizar a empresa." }, { status: 500 });
  }
}
