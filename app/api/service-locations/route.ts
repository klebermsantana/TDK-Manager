import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { getDb } from "@/db";
import { companies, serviceLocations } from "@/db/schema";

export async function GET(request: Request) {
  if (!(await getChatGPTUser()))
    return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const companyId = Number(
      new URL(request.url).searchParams.get("companyId"),
    );
    const rows = companyId
      ? await getDb()
          .select()
          .from(serviceLocations)
          .where(eq(serviceLocations.companyId, companyId))
          .orderBy(asc(serviceLocations.name))
      : await getDb()
          .select()
          .from(serviceLocations)
          .orderBy(asc(serviceLocations.name));
    return Response.json({ locations: rows });
  } catch {
    return Response.json(
      { error: "Não foi possível carregar os locais." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requirePermission("crm");
  if (denied) return denied;
  try {
    const p = (await request.json()) as Record<string, unknown>;
    const companyId = Number(p.companyId),
      name = String(p.name ?? "").trim(),
      address = String(p.address ?? "").trim();
    if (!companyId || !name || !address)
      return Response.json(
        { error: "Informe cliente, nome e endereço do local." },
        { status: 400 },
      );
    const [company] = await getDb()
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company)
      return Response.json(
        { error: "Cliente não encontrado." },
        { status: 404 },
      );
    const [location] = await getDb()
      .insert(serviceLocations)
      .values({ companyId, name, address })
      .returning();
    return Response.json({ location }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Não foi possível cadastrar o local." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const denied = await requirePermission("crm");
  if (denied) return denied;
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id)
      return Response.json({ error: "Local inválido." }, { status: 400 });
    await getDb().delete(serviceLocations).where(eq(serviceLocations.id, id));
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "O local está em uso e não pode ser excluído." },
      { status: 409 },
    );
  }
}
