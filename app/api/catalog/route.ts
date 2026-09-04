import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { catalogItems } from "@/db/schema";

const categories = new Set(["material", "servico"]);
const values = (payload: Record<string, unknown>) => ({
  category: String(payload.category ?? ""), code: String(payload.code ?? "").trim() || null,
  description: String(payload.description ?? "").trim(), unit: String(payload.unit ?? "un").trim() || "un",
  cost: Number(payload.cost ?? 0), competitivePrice: Number(payload.competitivePrice ?? 0),
  standardPrice: Number(payload.standardPrice ?? 0), valuePrice: Number(payload.valuePrice ?? 0),
});
const valid = (item: ReturnType<typeof values>) => categories.has(item.category) && item.description && [item.cost,item.competitivePrice,item.standardPrice,item.valuePrice].every((number) => Number.isFinite(number) && number >= 0);

export async function GET() {
  if (!await getChatGPTUser()) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try { return Response.json({ catalog: await getDb().select().from(catalogItems).orderBy(asc(catalogItems.description)) }); }
  catch { return Response.json({ error: "Não foi possível carregar o catálogo." }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try { const item=values(await request.json()); if(!valid(item)) return Response.json({error:"Revise os dados e preços do item."},{status:400}); const [created]=await getDb().insert(catalogItems).values(item).returning(); return Response.json({item:created},{status:201}); }
  catch { return Response.json({error:"Não foi possível cadastrar o item."},{status:500}); }
}
export async function PATCH(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try { const payload=await request.json() as Record<string,unknown>; const id=Number(payload.id); const item=values(payload); if(!id||!valid(item)) return Response.json({error:"Item inválido."},{status:400}); const [updated]=await getDb().update(catalogItems).set({...item,updatedAt:new Date().toISOString()}).where(eq(catalogItems.id,id)).returning(); return updated?Response.json({item:updated}):Response.json({error:"Item não encontrado."},{status:404}); }
  catch { return Response.json({error:"Não foi possível atualizar o item."},{status:500}); }
}
export async function DELETE(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try { const id=Number(new URL(request.url).searchParams.get("id")); if(!id)return Response.json({error:"Item inválido."},{status:400}); const [deleted]=await getDb().delete(catalogItems).where(eq(catalogItems.id,id)).returning(); return deleted?Response.json({success:true}):Response.json({error:"Item não encontrado."},{status:404}); }
  catch { return Response.json({error:"Não foi possível excluir o item."},{status:500}); }
}
