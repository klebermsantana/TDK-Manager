import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { getDb } from "@/db";
import { companies } from "@/db/schema";

export async function GET(request: Request) {
  if (!(await getChatGPTUser()))
    return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  const [company] = id
    ? await getDb()
        .select()
        .from(companies)
        .where(eq(companies.id, id))
        .limit(1)
    : [];
  if (!company?.logoStorageKey)
    return Response.json(
      { error: "Logotipo não encontrado." },
      { status: 404 },
    );
  const object = await env.BUCKET.get(company.logoStorageKey);
  if (!object)
    return Response.json(
      { error: "Arquivo do logotipo não encontrado." },
      { status: 404 },
    );
  return new Response(object.body, {
    headers: {
      "Content-Type": company.logoContentType ?? "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function POST(request: Request) {
  const denied = await requirePermission("crm");
  if (denied) return denied;
  if (!(await getChatGPTUser()))
    return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const data = await request.formData();
    const companyId = Number(data.get("companyId"));
    const file = data.get("file");
    const [company] = companyId
      ? await getDb()
          .select()
          .from(companies)
          .where(eq(companies.id, companyId))
          .limit(1)
      : [];
    if (
      !company ||
      !(file instanceof File) ||
      !file.size ||
      !file.type.startsWith("image/")
    )
      return Response.json(
        { error: "Selecione um logotipo válido." },
        { status: 400 },
      );
    if (file.size > 5 * 1024 * 1024)
      return Response.json(
        { error: "O logotipo deve ter no máximo 5 MB." },
        { status: 400 },
      );
    const safeName =
      file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "logo.png";
    const storageKey = `companies/${companyId}/${crypto.randomUUID()}-${safeName}`;
    await env.BUCKET.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    if (company.logoStorageKey) await env.BUCKET.delete(company.logoStorageKey);
    const [updated] = await getDb()
      .update(companies)
      .set({
        logoStorageKey: storageKey,
        logoContentType: file.type,
        logoName: file.name.slice(0, 180),
      })
      .where(eq(companies.id, companyId))
      .returning();
    return Response.json({ company: updated });
  } catch {
    return Response.json(
      { error: "Não foi possível salvar o logotipo." },
      { status: 500 },
    );
  }
}
