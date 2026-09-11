import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureTreasuryAlertSettings } from "@/app/treasury-executive-alerts-runtime";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import {
  assignDefaultOnEscalation,
  assignTreasuryAlertOccurrence,
  closeAssignmentAtResolution,
  listTreasuryAlertAssignmentHistory,
  listTreasuryAlertAssignmentRules,
  listTreasuryAlertUsers,
  saveTreasuryAlertAssignmentRule,
} from "@/app/treasury-alert-assignment";
import { getDb } from "@/db";
import { treasuryAlertOccurrences } from "@/db/treasury-closing-schema";

async function synchronizeResponsibilityHistory() {
  const db = getDb();
  const occurrences = await db.select().from(treasuryAlertOccurrences);
  for (const occurrence of occurrences) {
    if (occurrence.status === "active") {
      await assignDefaultOnEscalation(occurrence);
      continue;
    }
    if (occurrence.resolvedAt) {
      await closeAssignmentAtResolution(occurrence.id, "system", occurrence.resolvedAt);
    }
  }
}

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureTreasuryAlertSettings();
    await synchronizeResponsibilityHistory();
    const db = getDb();
    const [occurrences, rules, users, history] = await Promise.all([
      db.select().from(treasuryAlertOccurrences),
      listTreasuryAlertAssignmentRules(),
      listTreasuryAlertUsers(),
      listTreasuryAlertAssignmentHistory(),
    ]);
    const active = occurrences.filter((item) => item.status === "active");
    const escalated = active.filter((item) => item.ackEscalatedAt || item.resolutionEscalatedAt);
    return Response.json({
      currentUser: { email: auth.email },
      assignments: occurrences.map((item) => ({
        occurrenceId: item.id,
        status: item.status,
        alertType: item.alertType,
        assignedUserId: item.assignedUserId,
        assignedName: item.assignedName,
        assignedEmail: item.assignedEmail,
        assignedAt: item.assignedAt,
        assignmentSource: item.assignmentSource,
      })),
      rules,
      users,
      history,
      summary: {
        active: active.length,
        assigned: active.filter((item) => item.assignedEmail).length,
        unassigned: active.filter((item) => !item.assignedEmail).length,
        escalated: escalated.length,
        escalatedAssigned: escalated.filter((item) => item.assignedEmail).length,
        escalatedUnassigned: escalated.filter((item) => !item.assignedEmail).length,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar a responsabilidade operacional dos alertas." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureTreasuryAlertSettings();
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");

    if (action === "assign" || action === "take") {
      const occurrenceId = Number(payload.occurrenceId);
      if (!Number.isInteger(occurrenceId) || occurrenceId <= 0) {
        return Response.json({ error: "Ocorrência de alerta inválida." }, { status: 400 });
      }
      let userId: number | null = null;
      let source: "manual" | "take" = "manual";
      if (action === "take") {
        const users = await listTreasuryAlertUsers();
        const current = users.find((user) => user.email.toLowerCase() === auth.email.toLowerCase());
        if (!current) return Response.json({ error: "Seu usuário não está habilitado para assumir alertas da Tesouraria." }, { status: 403 });
        userId = current.id;
        source = "take";
      } else {
        const rawUserId = payload.userId;
        userId = rawUserId === null || rawUserId === "" || rawUserId === undefined ? null : Number(rawUserId);
        if (userId !== null && (!Number.isInteger(userId) || userId <= 0)) {
          return Response.json({ error: "Responsável inválido." }, { status: 400 });
        }
      }
      const occurrence = await assignTreasuryAlertOccurrence({
        occurrenceId,
        userId,
        source,
        performedBy: auth.email,
        note: action === "take" ? "Responsabilidade assumida pelo próprio usuário." : null,
      });
      return Response.json({ occurrence });
    }

    if (action === "rule") {
      const alertType = String(payload.alertType ?? "");
      const rawUserId = payload.userId;
      const userId = rawUserId === null || rawUserId === "" || rawUserId === undefined ? null : Number(rawUserId);
      if (userId !== null && (!Number.isInteger(userId) || userId <= 0)) {
        return Response.json({ error: "Responsável padrão inválido." }, { status: 400 });
      }
      const rule = await saveTreasuryAlertAssignmentRule({
        alertType,
        userId,
        active: payload.active !== false,
        performedBy: auth.email,
      });
      return Response.json({ rule });
    }

    return Response.json({ error: "Ação de responsabilidade inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a responsabilidade do alerta." }, { status: 500 });
  }
}
