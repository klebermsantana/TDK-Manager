import { asc, eq, sql } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { getDb } from "@/db";
import { companies, goals } from "@/db/schema";
import { goalFinancialScopes } from "@/db/goal-scope-schema";

const commercialTypes = new Set(["sales", "approved_proposals", "received", "margin"]);
const financialTypes = new Set(["service_revenue", "service_margin"]);
const validTypes = new Set([...commercialTypes, ...financialTypes]);

function isFinancialType(type: string) {
  return financialTypes.has(type);
}

function cleanCompanyId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function ensureGoalScopeTable() {
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS goal_financial_scopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL UNIQUE,
      company_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_goal_financial_scopes_company ON goal_financial_scopes(company_id)`));
}

async function requireForType(type: string) {
  return requirePermission(isFinancialType(type) ? "service_profitability" : "crm");
}

export async function GET() {
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });

  try {
    await ensureGoalScopeTable();
    const db = getDb();
    const [goalRows, scopes, companyRows] = await Promise.all([
      db.select().from(goals).orderBy(asc(goals.startsAt)),
      db.select().from(goalFinancialScopes),
      db.select({ id: companies.id, name: companies.name }).from(companies),
    ]);

    const financialDenied = await requirePermission("service_profitability");
    const canSeeFinancial = financialDenied === null;
    const scopeByGoal = new Map(scopes.map((scope) => [scope.goalId, scope]));
    const companyById = new Map(companyRows.map((company) => [company.id, company.name]));

    return Response.json({
      goals: goalRows
        .filter((goal) => canSeeFinancial || !isFinancialType(goal.type))
        .map((goal) => {
          const scope = scopeByGoal.get(goal.id);
          return {
            ...goal,
            companyId: scope?.companyId ?? null,
            companyName: scope?.companyId ? companyById.get(scope.companyId) ?? null : null,
          };
        }),
    });
  } catch {
    return Response.json({ error: "Não foi possível carregar as metas." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });

  try {
    await ensureGoalScopeTable();
    const payload = await request.json() as Record<string, unknown>;
    const name = String(payload.name ?? "").trim();
    const type = String(payload.type ?? "sales");
    const target = Number(payload.target);
    const startsAt = String(payload.startsAt ?? "");
    const endsAt = String(payload.endsAt ?? "");
    const companyId = cleanCompanyId(payload.companyId);

    if (!name || !validTypes.has(type) || !Number.isFinite(target) || target <= 0 || !validDate(startsAt) || !validDate(endsAt) || endsAt < startsAt) {
      return Response.json({ error: "Revise o nome, o valor e o período da meta." }, { status: 400 });
    }

    const denied = await requireForType(type);
    if (denied) return denied;

    const db = getDb();
    if (companyId) {
      const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!company) return Response.json({ error: "Cliente não encontrado." }, { status: 400 });
    }

    const [goal] = await db.insert(goals).values({ name, type, target, startsAt, endsAt }).returning();
    if (isFinancialType(type)) {
      try {
        await db.insert(goalFinancialScopes).values({ goalId: goal.id, companyId });
      } catch (error) {
        await db.delete(goals).where(eq(goals.id, goal.id));
        throw error;
      }
    }

    return Response.json({ goal: { ...goal, companyId } }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível cadastrar a meta." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });

  try {
    await ensureGoalScopeTable();
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    if (!id) return Response.json({ error: "Meta inválida." }, { status: 400 });

    const db = getDb();
    const [existing] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Meta não encontrada." }, { status: 404 });

    const name = String(payload.name ?? existing.name).trim();
    const type = String(payload.type ?? existing.type);
    const target = Number(payload.target ?? existing.target);
    const startsAt = String(payload.startsAt ?? existing.startsAt);
    const endsAt = String(payload.endsAt ?? existing.endsAt);
    const companyId = cleanCompanyId(payload.companyId);

    if (!name || !validTypes.has(type) || !Number.isFinite(target) || target <= 0 || !validDate(startsAt) || !validDate(endsAt) || endsAt < startsAt) {
      return Response.json({ error: "Revise os dados da meta." }, { status: 400 });
    }

    const needsFinancialPermission = isFinancialType(existing.type) || isFinancialType(type);
    const denied = await requirePermission(needsFinancialPermission ? "service_profitability" : "crm");
    if (denied) return denied;

    if (companyId) {
      const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!company) return Response.json({ error: "Cliente não encontrado." }, { status: 400 });
    }

    const [goal] = await db.update(goals).set({
      name,
      type,
      target,
      startsAt,
      endsAt,
      active: payload.active !== false,
      updatedAt: new Date().toISOString(),
    }).where(eq(goals.id, id)).returning();

    if (isFinancialType(type)) {
      await db.insert(goalFinancialScopes).values({ goalId: id, companyId }).onConflictDoUpdate({
        target: goalFinancialScopes.goalId,
        set: { companyId, updatedAt: new Date().toISOString() },
      });
    } else {
      await db.delete(goalFinancialScopes).where(eq(goalFinancialScopes.goalId, id));
    }

    return Response.json({ goal: { ...goal, companyId: isFinancialType(type) ? companyId : null } });
  } catch {
    return Response.json({ error: "Não foi possível atualizar a meta." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });

  try {
    await ensureGoalScopeTable();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "Meta inválida." }, { status: 400 });

    const db = getDb();
    const [existing] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Meta não encontrada." }, { status: 404 });

    const denied = await requireForType(existing.type);
    if (denied) return denied;

    await db.delete(goalFinancialScopes).where(eq(goalFinancialScopes.goalId, id));
    await db.delete(goals).where(eq(goals.id, id));
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Não foi possível excluir a meta." }, { status: 500 });
  }
}
