import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";

const ownerEmail = "kleber.santana@tecnodesk.com.br";

export async function requireServiceCostAccess(): Promise<Response | null> {
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  if (auth.email.toLowerCase() === ownerEmail) return null;

  const [user] = await getDb().select().from(users).where(eq(users.email, auth.email)).limit(1);
  if (!user || !user.active) return Response.json({ error: "Seu acesso ao TDK Manager está inativo." }, { status: 403 });
  if (user.role === "admin" || user.role === "manager") return null;
  try {
    const permissions = JSON.parse(user.permissions) as string[];
    if (permissions.includes("payables") || permissions.includes("service_profitability")) return null;
  } catch {}
  return Response.json({ error: "Você não possui permissão para consultar custos e remuneração de técnicos." }, { status: 403 });
}
