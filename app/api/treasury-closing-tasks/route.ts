import { asc, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { GET as getClosingDiagnostics } from "@/app/api/treasury-closing/route";
import { todaySaoPaulo } from "@/app/financial-ledger";
import { ensureTreasuryClosingTaskTables } from "@/app/treasury-closing-tasks-runtime";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { treasuryBankAccounts } from "@/db/treasury-schema";
import { treasuryClosingTaskAudit, treasuryClosingTasks } from "@/db/treasury-closing-schema";

const ownerEmail = "kleber.santana@tecnodesk.com.br";
const allowedStatuses = new Set(["open", "in_progress", "waiting", "resolved"]);
const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };

type IssueSnapshot = {
  issueKey: string;
  scope: "account" | "global";
  bankAccountId: number | null;
  issueType: string;
  title: string;
  detail: string;
  recommendedAction: string;
  priority: "critical" | "high" | "medium";
  affectedAmount: number;
};

function hasTreasuryAccessCandidate(user: typeof users.$inferSelect) {
  if (!user.active) return false;
  if (user.email.toLowerCase() === ownerEmail || user.role === "admin") return true;
  try {
    const permissions = JSON.parse(user.permissions) as string[];
    return permissions.includes("receivables") && permissions.includes("payables");
  } catch {
    return false;
  }
}

function deriveIssues(payload: any): IssueSnapshot[] {
  const issues: IssueSnapshot[] = [];
  const date = String(payload.date ?? todaySaoPaulo());
  for (const account of payload.accounts ?? []) {
    const accountId = Number(account.accountId);
    const accountName = String(account.accountName ?? `Conta #${accountId}`);
    if (date < String(account.balanceDate ?? "")) {
      issues.push({
        issueKey: `account:${accountId}:base_anchor`, scope: "account", bankAccountId: accountId,
        issueType: "base_anchor", title: "Saldo-base posterior à data de conferência",
        detail: `${accountName} possui saldo-base em ${account.balanceDate}, posterior à conferência de ${date}.`,
        recommendedAction: "Revise a data e o saldo-base da conta ou utilize uma data de conferência posterior.",
        priority: "medium", affectedAmount: 0,
      });
    }

    if (!account.statementCovered) {
      const hasImport = Boolean(account.latestImportPeriodEnd);
      issues.push({
        issueKey: `account:${accountId}:${hasImport ? "statement_outdated" : "statement_missing"}`,
        scope: "account", bankAccountId: accountId,
        issueType: hasImport ? "statement_outdated" : "statement_missing",
        title: hasImport ? "Extrato bancário desatualizado" : "Extrato bancário não importado",
        detail: hasImport
          ? `${accountName} possui extrato somente até ${account.latestImportPeriodEnd}; a conferência é ${date}.`
          : `${accountName} ainda não possui extrato suficiente para a conferência de ${date}.`,
        recommendedAction: "Abra a Conciliação Bancária e importe o OFX/CSV que cubra a data da conferência.",
        priority: "high", affectedAmount: 0,
      });
    } else if (account.statementBalance === null) {
      issues.push({
        issueKey: `account:${accountId}:statement_balance_missing`, scope: "account", bankAccountId: accountId,
        issueType: "statement_balance_missing", title: "Saldo bancário não calculável",
        detail: `${accountName} tem extrato cobrindo a data, mas não há informação suficiente para calcular a posição bancária.`,
        recommendedAction: "Revise o saldo-base da conta e o período dos lançamentos importados no extrato.",
        priority: "high", affectedAmount: 0,
      });
    }

    if (account.closingDifference !== null && Math.abs(Number(account.closingDifference)) > 0.01) {
      const amount = Math.abs(Number(account.closingDifference));
      issues.push({
        issueKey: `account:${accountId}:balance_difference`, scope: "account", bankAccountId: accountId,
        issueType: "balance_difference", title: "Diferença entre extrato e TDK",
        detail: `${accountName} apresenta diferença de ${amount.toFixed(2)} entre o saldo do extrato e o saldo calculado pelo razão.`,
        recommendedAction: "Compare extrato x razão, identifique lançamentos ausentes ou duplicados e corrija somente com suporte documental.",
        priority: "critical", affectedAmount: amount,
      });
    }

    if (Number(account.unallocatedAmount) > 0.01) {
      const amount = Number(account.unallocatedAmount);
      issues.push({
        issueKey: `account:${accountId}:unallocated_statement`, scope: "account", bankAccountId: accountId,
        issueType: "unallocated_statement", title: "Lançamentos do extrato sem conciliação",
        detail: `${accountName} possui ${account.unallocatedCount ?? 0} lançamento(s) com ${amount.toFixed(2)} ainda sem destino no TDK Manager.`,
        recommendedAction: "Abra a Conciliação Bancária e concilie ou rateie os lançamentos pendentes.",
        priority: "high", affectedAmount: amount,
      });
    }
  }

  if (Number(payload.summary?.unknownLedgerEventCount) > 0) {
    const count = Number(payload.summary.unknownLedgerEventCount);
    const amount = Number(payload.summary.unknownLedgerAmount ?? 0);
    issues.push({
      issueKey: "global:ledger_unassigned", scope: "global", bankAccountId: null,
      issueType: "ledger_unassigned", title: "Razão financeiro com movimentos sem conta",
      detail: `${count} evento(s) do razão, totalizando ${amount.toFixed(2)}, ainda não possuem conta bancária identificável e bloqueiam o fechamento seguro.`,
      recommendedAction: "Abra o Razão Financeiro/Tesouraria e atribua a conta bancária correta aos títulos ou movimentos envolvidos.",
      priority: "critical", affectedAmount: amount,
    });
  }
  return issues;
}

async function synchronizeTasks() {
  const date = todaySaoPaulo();
  const diagnosticResponse = await getClosingDiagnostics(new Request(`http://tdk.local/api/treasury-closing?date=${date}`));
  const diagnosticPayload = await diagnosticResponse.json() as any;
  if (!diagnosticResponse.ok) throw new Error(diagnosticPayload.error ?? "Falha ao conferir a tesouraria.");

  const db = getDb();
  const issues = deriveIssues(diagnosticPayload);
  const existing = await db.select().from(treasuryClosingTasks);
  const byKey = new Map(existing.map((task) => [task.issueKey, task]));
  const currentKeys = new Set(issues.map((issue) => issue.issueKey));
  const now = new Date().toISOString();

  for (const issue of issues) {
    const current = byKey.get(issue.issueKey);
    if (!current) {
      const [created] = await db.insert(treasuryClosingTasks).values({
        ...issue,
        status: "open",
        sourceActive: true,
        firstSeenDate: date,
        lastSeenDate: date,
      }).returning();
      await db.insert(treasuryClosingTaskAudit).values({
        taskId: created.id,
        action: "detected",
        fromStatus: null,
        toStatus: "open",
        performedBy: "system",
        note: "Pendência detectada automaticamente pela conferência da Tesouraria.",
      });
      continue;
    }

    const shouldReopen = current.status === "resolved" || !current.sourceActive;
    await db.update(treasuryClosingTasks).set({
      scope: issue.scope,
      bankAccountId: issue.bankAccountId,
      issueType: issue.issueType,
      title: issue.title,
      detail: issue.detail,
      recommendedAction: issue.recommendedAction,
      priority: issue.priority,
      affectedAmount: issue.affectedAmount,
      sourceActive: true,
      lastSeenDate: date,
      status: shouldReopen ? "open" : current.status,
      resolvedAt: shouldReopen ? null : current.resolvedAt,
      resolvedBy: shouldReopen ? null : current.resolvedBy,
      updatedAt: now,
    }).where(eq(treasuryClosingTasks.id, current.id));
    if (shouldReopen) {
      await db.insert(treasuryClosingTaskAudit).values({
        taskId: current.id,
        action: "auto_reopen",
        fromStatus: current.status,
        toStatus: "open",
        performedBy: "system",
        note: "A causa técnica voltou a ser detectada; a pendência foi reaberta automaticamente.",
      });
    }
  }

  for (const task of existing) {
    if (!task.sourceActive || currentKeys.has(task.issueKey)) continue;
    await db.update(treasuryClosingTasks).set({
      sourceActive: false,
      status: "resolved",
      resolvedAt: now,
      resolvedBy: "system",
      updatedAt: now,
    }).where(eq(treasuryClosingTasks.id, task.id));
    await db.insert(treasuryClosingTaskAudit).values({
      taskId: task.id,
      action: "auto_resolve",
      fromStatus: task.status,
      toStatus: "resolved",
      performedBy: "system",
      note: "A causa técnica deixou de existir na conferência atual e a pendência foi resolvida automaticamente.",
    });
  }
  return diagnosticPayload;
}

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureTreasuryClosingTaskTables();
    const diagnostics = await synchronizeTasks();
    const db = getDb();
    const [tasks, accounts, allUsers, audit] = await Promise.all([
      db.select().from(treasuryClosingTasks).orderBy(desc(treasuryClosingTasks.updatedAt), desc(treasuryClosingTasks.id)),
      db.select().from(treasuryBankAccounts).orderBy(asc(treasuryBankAccounts.name)),
      db.select().from(users).orderBy(asc(users.name)),
      db.select().from(treasuryClosingTaskAudit).orderBy(desc(treasuryClosingTaskAudit.createdAt), desc(treasuryClosingTaskAudit.id)).limit(100),
    ]);
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const enriched = tasks.map((task) => ({
      ...task,
      accountName: task.bankAccountId ? accountMap.get(task.bankAccountId)?.name ?? `Conta #${task.bankAccountId}` : "Tesouraria consolidada",
      bankName: task.bankAccountId ? accountMap.get(task.bankAccountId)?.bankName ?? null : null,
    })).sort((a, b) => {
      if (a.sourceActive !== b.sourceActive) return a.sourceActive ? -1 : 1;
      const pa = priorityOrder[a.priority] ?? 9;
      const pb = priorityOrder[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      return b.firstSeenDate.localeCompare(a.firstSeenDate);
    });
    const eligibleUsers = allUsers.filter(hasTreasuryAccessCandidate).map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role }));
    const active = enriched.filter((task) => task.sourceActive && task.status !== "resolved");
    return Response.json({
      date: diagnostics.date,
      tasks: enriched,
      users: eligibleUsers,
      currentUser: { email: auth.email },
      audit,
      summary: {
        active: active.length,
        critical: active.filter((task) => task.priority === "critical").length,
        high: active.filter((task) => task.priority === "high").length,
        medium: active.filter((task) => task.priority === "medium").length,
        unassigned: active.filter((task) => !task.assignedEmail).length,
        inProgress: active.filter((task) => task.status === "in_progress").length,
        waiting: active.filter((task) => task.status === "waiting").length,
        affectedAmount: active.reduce((sum, task) => sum + Math.abs(Number(task.affectedAmount)), 0),
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar as pendências da Tesouraria." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureTreasuryClosingTaskTables();
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const action = String(payload.action ?? "");
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Pendência inválida." }, { status: 400 });
    const db = getDb();
    const [task] = await db.select().from(treasuryClosingTasks).where(eq(treasuryClosingTasks.id, id)).limit(1);
    if (!task) return Response.json({ error: "Pendência não encontrada." }, { status: 404 });
    const now = new Date().toISOString();

    if (action === "take") {
      const [user] = await db.select().from(users).where(eq(users.email, auth.email)).limit(1);
      await db.update(treasuryClosingTasks).set({
        assignedUserId: user?.id ?? null,
        assignedName: user?.name ?? auth.email,
        assignedEmail: auth.email,
        updatedAt: now,
      }).where(eq(treasuryClosingTasks.id, id));
      await db.insert(treasuryClosingTaskAudit).values({ taskId: id, action: "take", fromStatus: task.status, toStatus: task.status, performedBy: auth.email, note: "Responsabilidade assumida pelo usuário." });
      return Response.json({ updated: true });
    }

    if (action === "assign") {
      const userId = payload.userId === null || payload.userId === "" ? null : Number(payload.userId);
      if (userId === null) {
        await db.update(treasuryClosingTasks).set({ assignedUserId: null, assignedName: null, assignedEmail: null, updatedAt: now }).where(eq(treasuryClosingTasks.id, id));
        await db.insert(treasuryClosingTaskAudit).values({ taskId: id, action: "unassign", fromStatus: task.status, toStatus: task.status, performedBy: auth.email, note: "Responsável removido." });
        return Response.json({ updated: true });
      }
      if (!Number.isInteger(userId) || userId <= 0) return Response.json({ error: "Responsável inválido." }, { status: 400 });
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || !hasTreasuryAccessCandidate(user)) return Response.json({ error: "O usuário selecionado não possui acesso ativo à Tesouraria." }, { status: 400 });
      await db.update(treasuryClosingTasks).set({ assignedUserId: user.id, assignedName: user.name, assignedEmail: user.email, updatedAt: now }).where(eq(treasuryClosingTasks.id, id));
      await db.insert(treasuryClosingTaskAudit).values({ taskId: id, action: "assign", fromStatus: task.status, toStatus: task.status, performedBy: auth.email, note: `Responsável definido: ${user.name} <${user.email}>.` });
      return Response.json({ updated: true });
    }

    if (action === "status") {
      const status = String(payload.status ?? "");
      if (!allowedStatuses.has(status)) return Response.json({ error: "Status operacional inválido." }, { status: 400 });
      if (status === "resolved" && task.sourceActive) {
        return Response.json({ error: "A causa técnica ainda está ativa. Corrija a origem da pendência; o TDK Manager resolverá a tarefa automaticamente quando a conferência ficar consistente." }, { status: 409 });
      }
      const note = String(payload.note ?? "").trim() || null;
      await db.update(treasuryClosingTasks).set({
        status,
        resolvedAt: status === "resolved" ? now : null,
        resolvedBy: status === "resolved" ? auth.email : null,
        updatedAt: now,
      }).where(eq(treasuryClosingTasks.id, id));
      await db.insert(treasuryClosingTaskAudit).values({
        taskId: id,
        action: "status",
        fromStatus: task.status,
        toStatus: status,
        performedBy: auth.email,
        note,
      });
      return Response.json({ updated: true });
    }

    if (action === "comment") {
      const note = String(payload.note ?? "").trim();
      if (note.length < 2) return Response.json({ error: "Informe uma observação." }, { status: 400 });
      await db.insert(treasuryClosingTaskAudit).values({ taskId: id, action: "comment", fromStatus: task.status, toStatus: task.status, performedBy: auth.email, note });
      await db.update(treasuryClosingTasks).set({ updatedAt: now }).where(eq(treasuryClosingTasks.id, id));
      return Response.json({ updated: true });
    }

    return Response.json({ error: "Ação de pendência inválida." }, { status: 400 });
  } catch {
    return Response.json({ error: "Não foi possível atualizar a pendência da Tesouraria." }, { status: 500 });
  }
}
