import { asc, desc, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { opportunities, proposalItems, proposals } from "@/db/schema";

const statuses = new Set(["rascunho", "enviada", "aprovada", "recusada", "expirada"]);

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const rows = await getDb().select({ id: proposals.id, opportunityId: proposals.opportunityId, opportunityTitle: opportunities.title, companyName: opportunities.companyName, number: proposals.number, status: proposals.status, priceTable: proposals.priceTable, validUntil: proposals.validUntil, discount: proposals.discount, subtotal: proposals.subtotal, total: proposals.total, notes: proposals.notes, createdAt: proposals.createdAt }).from(proposals).innerJoin(opportunities, eq(proposals.opportunityId, opportunities.id)).orderBy(desc(proposals.createdAt));
    const items = rows.length ? await getDb().select().from(proposalItems).where(inArray(proposalItems.proposalId, rows.map((row) => row.id))).orderBy(asc(proposalItems.id)) : [];
    const records = rows.map((row) => ({ ...row, items: items.filter((item) => item.proposalId === row.id) }));
    const requestedId = Number(new URL(request.url).searchParams.get("id"));
    if (requestedId) {
      const proposal = records.find((record) => record.id === requestedId);
      if (!proposal) return Response.json({ error: "Proposta não encontrada." }, { status: 404 });
      return Response.json({ proposal });
    }
    return Response.json({ proposals: records });
  } catch {
    return Response.json({ error: "Não foi possível carregar as propostas." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const opportunityId = Number(payload.opportunityId);
    const discount = Number(payload.discount ?? 0);
    const rawItems = Array.isArray(payload.items) ? payload.items as Record<string, unknown>[] : [];
    const items = rawItems.map((item) => ({ category: String(item.category), description: String(item.description ?? "").trim(), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })).filter((item) => item.description && ["material", "servico"].includes(item.category) && item.quantity > 0 && item.unitPrice >= 0);
    if (!opportunityId || !items.length || !Number.isFinite(discount) || discount < 0) return Response.json({ error: "Revise os dados e inclua ao menos um item válido." }, { status: 400 });
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (discount > subtotal) return Response.json({ error: "O desconto não pode superar o subtotal." }, { status: 400 });
    const number = `PROP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const [proposal] = await getDb().insert(proposals).values({ opportunityId, number, priceTable: String(payload.priceTable ?? "padrao"), validUntil: payload.validUntil ? String(payload.validUntil) : null, discount, subtotal, total: subtotal - discount, notes: String(payload.notes ?? "").trim() || null }).returning();
    const createdItems = await getDb().insert(proposalItems).values(items.map((item) => ({ ...item, proposalId: proposal.id, total: item.quantity * item.unitPrice }))).returning();
    const [opportunity] = await getDb().select({ title: opportunities.title, companyName: opportunities.companyName }).from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
    return Response.json({ proposal: { ...proposal, opportunityTitle: opportunity?.title ?? "Oportunidade", companyName: opportunity?.companyName ?? "Empresa", items: createdItems } }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível cadastrar a proposta." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id); const status = String(payload.status ?? "");
    if (!id || !statuses.has(status)) return Response.json({ error: "Status inválido." }, { status: 400 });
    if (!Array.isArray(payload.items)) {
      const [proposal] = await getDb().update(proposals).set({ status, updatedAt: new Date().toISOString() }).where(eq(proposals.id, id)).returning();
      if (!proposal) return Response.json({ error: "Proposta não encontrada." }, { status: 404 });
      return Response.json({ proposal });
    }
    const opportunityId = Number(payload.opportunityId);
    const discount = Number(payload.discount ?? 0);
    const items = (payload.items as Record<string, unknown>[]).map((item) => ({ category: String(item.category), description: String(item.description ?? "").trim(), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })).filter((item) => item.description && ["material", "servico"].includes(item.category) && item.quantity > 0 && item.unitPrice >= 0);
    if (!opportunityId || !items.length || !Number.isFinite(discount) || discount < 0) return Response.json({ error: "Revise os dados e inclua ao menos um item válido." }, { status: 400 });
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (discount > subtotal) return Response.json({ error: "O desconto não pode superar o subtotal." }, { status: 400 });
    const [proposal] = await getDb().update(proposals).set({ opportunityId, status, priceTable: String(payload.priceTable ?? "padrao"), validUntil: payload.validUntil ? String(payload.validUntil) : null, discount, subtotal, total: subtotal - discount, notes: String(payload.notes ?? "").trim() || null, updatedAt: new Date().toISOString() }).where(eq(proposals.id, id)).returning();
    if (!proposal) return Response.json({ error: "Proposta não encontrada." }, { status: 404 });
    await getDb().delete(proposalItems).where(eq(proposalItems.proposalId, id));
    const createdItems = await getDb().insert(proposalItems).values(items.map((item) => ({ ...item, proposalId: id, total: item.quantity * item.unitPrice }))).returning();
    const [opportunity] = await getDb().select({ title: opportunities.title, companyName: opportunities.companyName }).from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
    return Response.json({ proposal: { ...proposal, opportunityTitle: opportunity?.title ?? "Oportunidade", companyName: opportunity?.companyName ?? "Empresa", items: createdItems } });
  } catch { return Response.json({ error: "Não foi possível atualizar a proposta." }, { status: 500 }); }
}
