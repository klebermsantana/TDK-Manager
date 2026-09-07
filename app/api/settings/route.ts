import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { companySettings, users } from "@/db/schema";

const defaults = { id: 1, companyName: "TDK Soluções que Transformam", email: "kleber.santana@tecnodesk.com.br", address: "Rua Silva Bueno, 2122 - Conjuntos 12 e 22", city: "São Paulo", state: "SP", postalCode: "04208-002", defaultPriceTable: "padrao", proposalValidityDays: 15, defaultPaymentTerms: "A prazo", defaultInstallments: 1, defaultDueDays: 30 };

async function loadSettings() {
  const db = getDb();
  const [existing] = await db.select().from(companySettings).where(eq(companySettings.id, 1)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(companySettings).values(defaults).returning();
  return created;
}

export async function GET() {
  if (!await getChatGPTUser()) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try { return Response.json({ settings: await loadSettings() }); }
  catch { return Response.json({ error: "Não foi possível carregar as configurações." }, { status: 503 }); }
}

export async function PATCH(request: Request) {
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const [current] = await getDb().select().from(users).where(eq(users.email, auth.email)).limit(1);
    if (current?.role !== "admin" && auth.email.toLowerCase() !== "kleber.santana@tecnodesk.com.br") return Response.json({ error: "Somente administradores podem alterar as configurações." }, { status: 403 });
    await loadSettings();
    const payload = await request.json() as Record<string, unknown>;
    const companyName = String(payload.companyName ?? "").trim();
    const proposalValidityDays = Math.max(1, Math.min(365, Number(payload.proposalValidityDays) || 15));
    const defaultInstallments = Math.max(1, Math.min(120, Number(payload.defaultInstallments) || 1));
    const defaultDueDays = Math.max(0, Math.min(365, Number(payload.defaultDueDays) || 0));
    if (!companyName) return Response.json({ error: "Informe o nome da empresa." }, { status: 400 });
    const [settings] = await getDb().update(companySettings).set({ companyName, document:String(payload.document??"").trim()||null,email:String(payload.email??"").trim()||null,phone:String(payload.phone??"").trim()||null,address:String(payload.address??"").trim()||null,city:String(payload.city??"").trim()||null,state:String(payload.state??"").trim().toUpperCase().slice(0,2)||null,postalCode:String(payload.postalCode??"").trim()||null,defaultPriceTable:String(payload.defaultPriceTable??"padrao"),proposalValidityDays,defaultPaymentTerms:String(payload.defaultPaymentTerms??"A prazo"),defaultInstallments,defaultDueDays,proposalNotes:String(payload.proposalNotes??"").trim()||null,updatedAt:new Date().toISOString() }).where(eq(companySettings.id,1)).returning();
    return Response.json({ settings });
  } catch { return Response.json({ error: "Não foi possível salvar as configurações." }, { status: 500 }); }
}
