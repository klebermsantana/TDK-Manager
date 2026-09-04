import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { companies, contacts } from "@/db/schema";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const rows = await getDb().select({
      id: contacts.id,
      companyId: contacts.companyId,
      companyName: companies.name,
      name: contacts.name,
      role: contacts.role,
      email: contacts.email,
      phone: contacts.phone,
      createdAt: contacts.createdAt,
    }).from(contacts).innerJoin(companies, eq(contacts.companyId, companies.id)).orderBy(asc(contacts.name));
    return Response.json({ contacts: rows });
  } catch {
    return Response.json({ error: "Não foi possível carregar os contatos." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const name = String(payload.name ?? "").trim();
    if (!companyId || !name) return Response.json({ error: "Empresa e nome do contato são obrigatórios." }, { status: 400 });
    const [contact] = await getDb().insert(contacts).values({
      companyId,
      name,
      role: String(payload.role ?? "").trim() || null,
      email: String(payload.email ?? "").trim() || null,
      phone: String(payload.phone ?? "").trim() || null,
    }).returning();
    const [company] = await getDb().select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
    return Response.json({ contact: { ...contact, companyName: company?.name ?? "Empresa" } }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível cadastrar o contato." }, { status: 500 });
  }
}
