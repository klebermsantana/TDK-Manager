import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";

const validRoles = new Set(["admin", "manager", "seller", "finance", "viewer"]);
const validPermissions = new Set(["crm", "proposals", "sales", "billing", "receivables", "payables", "reports", "settings"]);
const normalizePermissions = (value: unknown) => {
  const list = Array.isArray(value) ? value.map(String) : [];
  return [...new Set(list.filter((item) => validPermissions.has(item)))];
};
const serialize = (row: typeof users.$inferSelect) => ({ ...row, permissions: (() => { try { return JSON.parse(row.permissions) as string[]; } catch { return []; } })() });

async function ensureCurrentUser() {
  const auth = await getChatGPTUser();
  if (!auth) return null;
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, auth.email)).limit(1);
  if (existing) return existing;
  const all = await db.select({ id: users.id }).from(users).limit(1);
  const [created] = await db.insert(users).values({
    externalId: `chatgpt:${auth.email}`,
    email: auth.email,
    name: auth.fullName ?? auth.email,
    role: all.length ? "seller" : "admin",
    permissions: JSON.stringify(all.length ? ["crm", "proposals", "sales"] : [...validPermissions]),
  }).returning();
  return created;
}

export async function GET() {
  try {
    const current = await ensureCurrentUser();
    if (!current) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
    const rows = await getDb().select().from(users).orderBy(asc(users.name));
    return Response.json({ team: rows.map(serialize), currentUserId: current.id });
  } catch {
    return Response.json({ error: "Não foi possível carregar a equipe." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const current = await ensureCurrentUser();
    if (!current) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
    if (current.role !== "admin") return Response.json({ error: "Somente administradores podem cadastrar usuários." }, { status: 403 });
    const payload = await request.json() as Record<string, unknown>;
    const name = String(payload.name ?? "").trim();
    const email = String(payload.email ?? "").trim().toLowerCase();
    const role = String(payload.role ?? "seller");
    const permissions = normalizePermissions(payload.permissions);
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !validRoles.has(role)) return Response.json({ error: "Preencha nome, e-mail e perfil válidos." }, { status: 400 });
    const [created] = await getDb().insert(users).values({ externalId: `pending:${email}`, email, name, jobTitle: String(payload.jobTitle ?? "").trim() || null, role, permissions: JSON.stringify(role === "admin" ? [...validPermissions] : permissions), active: true }).returning();
    return Response.json({ member: serialize(created) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && /UNIQUE/i.test(error.message) ? "Já existe um usuário com este e-mail." : "Não foi possível cadastrar o usuário.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const current = await ensureCurrentUser();
    if (!current) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
    if (current.role !== "admin") return Response.json({ error: "Somente administradores podem alterar permissões." }, { status: 403 });
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const role = String(payload.role ?? "seller");
    if (!id || !validRoles.has(role)) return Response.json({ error: "Usuário ou perfil inválido." }, { status: 400 });
    if (id === current.id && payload.active === false) return Response.json({ error: "Você não pode desativar o próprio acesso." }, { status: 400 });
    const permissions = normalizePermissions(payload.permissions);
    const [updated] = await getDb().update(users).set({ name: String(payload.name ?? "").trim(), jobTitle: String(payload.jobTitle ?? "").trim() || null, role, permissions: JSON.stringify(role === "admin" ? [...validPermissions] : permissions), active: payload.active !== false }).where(eq(users.id, id)).returning();
    if (!updated) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
    return Response.json({ member: serialize(updated) });
  } catch {
    return Response.json({ error: "Não foi possível atualizar o usuário." }, { status: 500 });
  }
}
