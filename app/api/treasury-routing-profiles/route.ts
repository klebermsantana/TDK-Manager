import { desc } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { listTreasuryAlertUsers } from "@/app/treasury-alert-assignment";
import {
  listTreasuryRoutingProfiles,
  saveTreasuryRoutingProfile,
  treasuryRoutingDomains,
  type TreasuryAvailability,
  type TreasuryRoutingDomain,
} from "@/app/treasury-routing-runtime";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import { treasuryRoutingProfileAudit } from "@/db/treasury-routing-schema";

const allowedAvailability = new Set<TreasuryAvailability>(["available", "limited", "unavailable"]);

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const users = await listTreasuryAlertUsers();
    const profiles = await listTreasuryRoutingProfiles(users);
    const audit = await getDb().select().from(treasuryRoutingProfileAudit)
      .orderBy(desc(treasuryRoutingProfileAudit.createdAt), desc(treasuryRoutingProfileAudit.id))
      .limit(80);
    return Response.json({
      currentUser: { email: auth.email },
      domains: treasuryRoutingDomains,
      profiles,
      audit,
      summary: {
        total: profiles.length,
        available: profiles.filter((row) => row.effectiveAvailability === "available").length,
        limited: profiles.filter((row) => row.effectiveAvailability === "limited").length,
        unavailable: profiles.filter((row) => row.effectiveAvailability === "unavailable").length,
        specialists: profiles.reduce((sum, row) => sum + Object.values(row.skills).filter((level) => Number(level) === 3).length, 0),
        scheduled: profiles.filter((row) => row.activeSchedule).length,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar competências e disponibilidade." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const userId = Number(payload.userId);
    const availability = String(payload.availability ?? "") as TreasuryAvailability;
    const availabilityUntilRaw = String(payload.availabilityUntil ?? "").trim();
    const notes = String(payload.notes ?? "").trim().slice(0, 1000) || null;
    if (!Number.isInteger(userId) || userId <= 0) return Response.json({ error: "Usuário inválido." }, { status: 400 });
    if (!allowedAvailability.has(availability)) return Response.json({ error: "Disponibilidade inválida." }, { status: 400 });
    if (availabilityUntilRaw && !/^\d{4}-\d{2}-\d{2}$/.test(availabilityUntilRaw)) {
      return Response.json({ error: "Data limite de disponibilidade inválida." }, { status: 400 });
    }

    const users = await listTreasuryAlertUsers();
    const user = users.find((row) => row.id === userId);
    if (!user) return Response.json({ error: "O usuário selecionado não possui acesso ativo à Tesouraria." }, { status: 403 });

    const rawSkills = (payload.skills ?? {}) as Record<string, unknown>;
    const skills: Partial<Record<TreasuryRoutingDomain, number>> = {};
    for (const domain of treasuryRoutingDomains) {
      if (rawSkills[domain] === undefined) continue;
      const level = Number(rawSkills[domain]);
      if (!Number.isInteger(level) || level < 0 || level > 3) {
        return Response.json({ error: `Nível inválido para ${domain}. Use 0, 1, 2 ou 3.` }, { status: 400 });
      }
      skills[domain] = level;
    }

    const profile = await saveTreasuryRoutingProfile({
      userId,
      availability,
      availabilityUntil: availabilityUntilRaw || null,
      notes,
      skills,
      performedBy: auth.email,
    });
    return Response.json({ profile });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar competências e disponibilidade." }, { status: 500 });
  }
}
