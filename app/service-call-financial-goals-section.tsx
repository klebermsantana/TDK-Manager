"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Goal = {
  id: number;
  name: string;
  type: string;
  target: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  companyId: number | null;
  companyName: string | null;
};

type ProfitRow = {
  id: number;
  companyName: string;
  createdAt: string;
  revenueAmount: number | null;
  marginAmount: number | null;
  plannedRevenueAmount: number | null;
  plannedMarginAmount: number | null;
};

type Company = {
  id: number;
  name: string;
  isClient?: boolean;
};

type Metric = "service_revenue" | "service_margin";

function money(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function rowMonth(value: string) {
  const match = value.match(/^(\d{4}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function goalOverlapsMonth(goal: Goal, month: string) {
  const { start, end } = monthBounds(month);
  return goal.startsAt <= end && goal.endsAt >= start;
}

function achievement(actual: number, target: number) {
  return target > 0 ? actual / target * 100 : null;
}

export function ServiceCallFinancialGoalsSection() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [scopeCompanyId, setScopeCompanyId] = useState("");
  const [formMetric, setFormMetric] = useState<Metric>("service_revenue");
  const [formCompanyId, setFormCompanyId] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formMonth, setFormMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const locate = () => setTarget(document.querySelector<HTMLElement>(".service-profit-dashboard"));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const [profitResponse, goalsResponse, companiesResponse] = await Promise.all([
        fetch("/api/service-call-profitability", { cache: "no-store" }),
        fetch("/api/goals", { cache: "no-store" }),
        fetch("/api/companies", { cache: "no-store" }),
      ]);

      if (profitResponse.status === 403) {
        setAuthorized(false);
        return;
      }
      if (!profitResponse.ok || !goalsResponse.ok || !companiesResponse.ok) {
        setMessage("Não foi possível carregar as metas e os resultados financeiros.");
        return;
      }

      const profitPayload = await profitResponse.json() as { rows?: ProfitRow[] };
      const goalsPayload = await goalsResponse.json() as { goals?: Goal[] };
      const companiesPayload = await companiesResponse.json() as { companies?: Company[] };
      setRows(profitPayload.rows ?? []);
      setGoals((goalsPayload.goals ?? []).filter((goal) => goal.type === "service_revenue" || goal.type === "service_margin"));
      setCompanies((companiesPayload.companies ?? []).filter((company) => company.isClient !== false));
      setAuthorized(true);
      setMessage("");
    } catch {
      setMessage("Não foi possível carregar as metas e os resultados financeiros.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (target) void refresh();
  }, [target]);

  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);
  const selectedCompanyName = scopeCompanyId ? companyById.get(Number(scopeCompanyId)) ?? "" : "";

  const monthRows = useMemo(() => rows
    .filter((row) => rowMonth(row.createdAt) === month)
    .filter((row) => !selectedCompanyName || row.companyName === selectedCompanyName), [rows, month, selectedCompanyName]);

  const monthGoals = useMemo(() => goals
    .filter((goal) => goal.active && goalOverlapsMonth(goal, month))
    .filter((goal) => scopeCompanyId ? goal.companyId === Number(scopeCompanyId) : goal.companyId === null), [goals, month, scopeCompanyId]);

  const metrics = useMemo(() => {
    const allocatedRevenue = monthRows.filter((row) => row.revenueAmount !== null);
    const plannedRevenueRows = monthRows.filter((row) => row.plannedRevenueAmount !== null);
    const allocatedMargin = monthRows.filter((row) => row.marginAmount !== null);
    const plannedMarginRows = monthRows.filter((row) => row.plannedMarginAmount !== null);

    const realizedRevenue = allocatedRevenue.reduce((total, row) => total + (row.revenueAmount ?? 0), 0);
    const plannedRevenue = plannedRevenueRows.reduce((total, row) => total + (row.plannedRevenueAmount ?? 0), 0);
    const realizedMargin = allocatedMargin.reduce((total, row) => total + (row.marginAmount ?? 0), 0);
    const plannedMargin = plannedMarginRows.reduce((total, row) => total + (row.plannedMarginAmount ?? 0), 0);
    const revenueGoal = monthGoals.filter((goal) => goal.type === "service_revenue").reduce((total, goal) => total + goal.target, 0);
    const marginGoal = monthGoals.filter((goal) => goal.type === "service_margin").reduce((total, goal) => total + goal.target, 0);

    return {
      realizedRevenue,
      plannedRevenue,
      realizedMargin,
      plannedMargin,
      revenueGoal,
      marginGoal,
      revenueGoalAchievement: achievement(realizedRevenue, revenueGoal),
      marginGoalAchievement: achievement(realizedMargin, marginGoal),
      revenuePlanAchievement: plannedRevenue > 0 ? realizedRevenue / plannedRevenue * 100 : null,
      marginPlanAchievement: plannedMargin !== 0 ? realizedMargin / plannedMargin * 100 : null,
      revenueCoverage: monthRows.length ? allocatedRevenue.length / monthRows.length * 100 : null,
      planCoverage: monthRows.length ? plannedRevenueRows.length / monthRows.length * 100 : null,
    };
  }, [monthRows, monthGoals]);

  const clientRows = useMemo(() => {
    const rowsInMonth = rows.filter((row) => rowMonth(row.createdAt) === month);
    const names = [...new Set(rowsInMonth.map((row) => row.companyName).filter(Boolean))];
    return names.map((name) => {
      const items = rowsInMonth.filter((row) => row.companyName === name);
      const company = companies.find((item) => item.name === name);
      const companyGoals = goals.filter((goal) => goal.active && goalOverlapsMonth(goal, month) && goal.companyId === (company?.id ?? -1));
      const realizedRevenue = items.reduce((total, row) => total + (row.revenueAmount ?? 0), 0);
      const plannedRevenue = items.reduce((total, row) => total + (row.plannedRevenueAmount ?? 0), 0);
      const realizedMargin = items.reduce((total, row) => total + (row.marginAmount ?? 0), 0);
      const plannedMargin = items.reduce((total, row) => total + (row.plannedMarginAmount ?? 0), 0);
      const revenueGoal = companyGoals.filter((goal) => goal.type === "service_revenue").reduce((total, goal) => total + goal.target, 0);
      const marginGoal = companyGoals.filter((goal) => goal.type === "service_margin").reduce((total, goal) => total + goal.target, 0);
      return {
        name,
        calls: items.length,
        realizedRevenue,
        plannedRevenue,
        revenueGoal,
        revenueAchievement: achievement(realizedRevenue, revenueGoal),
        realizedMargin,
        plannedMargin,
        marginGoal,
        marginAchievement: achievement(realizedMargin, marginGoal),
      };
    }).sort((a, b) => b.realizedMargin - a.realizedMargin || b.realizedRevenue - a.realizedRevenue);
  }, [rows, goals, companies, month]);

  const history = useMemo(() => {
    const months = new Set<string>();
    rows.forEach((row) => {
      const key = rowMonth(row.createdAt);
      if (key) months.add(key);
    });
    goals.forEach((goal) => months.add(goal.startsAt.slice(0, 7)));
    months.add(month);

    return [...months].sort().slice(-6).map((key) => {
      const items = rows.filter((row) => rowMonth(row.createdAt) === key);
      const applicableGoals = goals.filter((goal) => goal.active && goal.companyId === null && goalOverlapsMonth(goal, key));
      const revenue = items.reduce((total, row) => total + (row.revenueAmount ?? 0), 0);
      const margin = items.reduce((total, row) => total + (row.marginAmount ?? 0), 0);
      const revenueGoal = applicableGoals.filter((goal) => goal.type === "service_revenue").reduce((total, goal) => total + goal.target, 0);
      const marginGoal = applicableGoals.filter((goal) => goal.type === "service_margin").reduce((total, goal) => total + goal.target, 0);
      return { key, revenue, margin, revenueGoal, marginGoal };
    });
  }, [rows, goals, month]);

  async function createGoal() {
    const value = Number(formTarget.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0 || !/^\d{4}-\d{2}$/.test(formMonth)) {
      setMessage("Informe um valor de meta e uma competência válidos.");
      return;
    }

    const companyId = formCompanyId ? Number(formCompanyId) : null;
    const companyName = companyId ? companyById.get(companyId) ?? "Cliente" : "Geral";
    const label = formMetric === "service_revenue" ? "Receita OS" : "Margem OS";
    const { start, end } = monthBounds(formMonth);

    setLoading(true);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Meta ${label} · ${companyName} · ${formMonth}`,
          type: formMetric,
          target: value,
          startsAt: start,
          endsAt: end,
          companyId,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível cadastrar a meta financeira.");
        return;
      }
      setFormTarget("");
      setMonth(formMonth);
      setScopeCompanyId(formCompanyId);
      setMessage("Meta financeira cadastrada.");
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function toggleGoal(goal: Goal) {
    setLoading(true);
    try {
      const response = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: goal.id,
          name: goal.name,
          type: goal.type,
          target: goal.target,
          startsAt: goal.startsAt,
          endsAt: goal.endsAt,
          active: !goal.active,
          companyId: goal.companyId,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        setMessage(result.error ?? "Não foi possível alterar a meta.");
        return;
      }
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function deleteGoal(goal: Goal) {
    if (!window.confirm(`Excluir a meta “${goal.name}”?`)) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/goals?id=${goal.id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        setMessage(result.error ?? "Não foi possível excluir a meta.");
        return;
      }
      setMessage("Meta excluída.");
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!target || authorized !== true) return null;

  const maxHistory = Math.max(1, ...history.flatMap((item) => [item.revenue, item.revenueGoal, Math.abs(item.margin), Math.abs(item.marginGoal)]));

  return createPortal(
    <section className="service-fin-goals-section">
      <header className="service-fin-goals-header">
        <div>
          <small>METAS E ORÇAMENTO GERENCIAL</small>
          <h3>Meta x previsto x realizado</h3>
          <p>Acompanhamento mensal de receita e margem das ordens de serviço, com metas gerais ou por cliente.</p>
        </div>
        <div className="service-fin-goals-head-filters">
          <label><span>Competência</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <label><span>Escopo</span><select value={scopeCompanyId} onChange={(event) => setScopeCompanyId(event.target.value)}><option value="">Geral</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
        </div>
      </header>

      <div className="service-fin-goals-kpis">
        <article><span>Meta de receita</span><strong>{metrics.revenueGoal ? money(metrics.revenueGoal) : "Sem meta"}</strong><small>{metrics.revenueGoal ? `${percent(metrics.revenueGoalAchievement)} atingido` : "cadastre abaixo"}</small></article>
        <article><span>Receita prevista</span><strong>{money(metrics.plannedRevenue)}</strong><small>{percent(metrics.planCoverage)} das OS com previsão</small></article>
        <article className={metrics.revenueGoal && metrics.realizedRevenue < metrics.revenueGoal ? "warning" : "good"}><span>Receita realizada</span><strong>{money(metrics.realizedRevenue)}</strong><small>{percent(metrics.revenuePlanAchievement)} do previsto</small></article>
        <article><span>Meta de margem</span><strong>{metrics.marginGoal ? money(metrics.marginGoal) : "Sem meta"}</strong><small>{metrics.marginGoal ? `${percent(metrics.marginGoalAchievement)} atingido` : "cadastre abaixo"}</small></article>
        <article><span>Margem prevista</span><strong>{money(metrics.plannedMargin)}</strong><small>{monthRows.length} OS na competência</small></article>
        <article className={(metrics.marginGoal && metrics.realizedMargin < metrics.marginGoal) || metrics.realizedMargin < 0 ? "danger" : "good"}><span>Margem realizada</span><strong>{money(metrics.realizedMargin)}</strong><small>{percent(metrics.marginPlanAchievement)} do previsto</small></article>
      </div>

      <section className="service-fin-goals-create">
        <div><small>NOVA META FINANCEIRA</small><h4>Definir objetivo mensal</h4><p>A meta pode ser geral ou exclusiva para um cliente.</p></div>
        <label><span>Indicador</span><select value={formMetric} onChange={(event) => setFormMetric(event.target.value as Metric)}><option value="service_revenue">Receita das OS</option><option value="service_margin">Margem das OS</option></select></label>
        <label><span>Cliente</span><select value={formCompanyId} onChange={(event) => setFormCompanyId(event.target.value)}><option value="">Meta geral</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label><span>Competência</span><input type="month" value={formMonth} onChange={(event) => setFormMonth(event.target.value)} /></label>
        <label><span>Valor-alvo</span><input inputMode="decimal" placeholder="Ex.: 100000,00" value={formTarget} onChange={(event) => setFormTarget(event.target.value)} /></label>
        <button type="button" onClick={() => void createGoal()} disabled={loading}>Cadastrar meta</button>
      </section>
      {message ? <p className="service-fin-goals-message">{message}</p> : null}

      <div className="service-fin-goals-grid">
        <section className="service-fin-goals-card">
          <header><div><small>EVOLUÇÃO</small><h4>Resultado mensal</h4></div><strong>últimas {history.length} competências</strong></header>
          <div className="service-fin-goals-history">
            {history.map((item) => <div className="service-fin-goals-history-row" key={item.key}>
              <strong>{item.key}</strong>
              <div>
                <span>Receita</span><i><b className="actual" style={{ width: `${Math.max(2, Math.abs(item.revenue) / maxHistory * 100)}%` }} /></i><em>{money(item.revenue)}</em>
                <span>Meta</span><i><b className="goal" style={{ width: `${item.revenueGoal ? Math.max(2, item.revenueGoal / maxHistory * 100) : 0}%` }} /></i><em>{item.revenueGoal ? money(item.revenueGoal) : "—"}</em>
                <span>Margem</span><i><b className={item.margin < 0 ? "margin negative" : "margin"} style={{ width: `${Math.max(2, Math.abs(item.margin) / maxHistory * 100)}%` }} /></i><em>{money(item.margin)}</em>
              </div>
            </div>)}
          </div>
        </section>

        <section className="service-fin-goals-card">
          <header><div><small>METAS CADASTRADAS</small><h4>{monthLabel(month)}</h4></div><strong>{goals.filter((goal) => goalOverlapsMonth(goal, month)).length}</strong></header>
          <div className="service-fin-goals-list">
            {goals.filter((goal) => goalOverlapsMonth(goal, month)).length ? goals.filter((goal) => goalOverlapsMonth(goal, month)).map((goal) => <article className={!goal.active ? "inactive" : ""} key={goal.id}>
              <div><strong>{goal.type === "service_revenue" ? "Receita OS" : "Margem OS"}</strong><span>{goal.companyName ?? "Geral"} · {goal.name}</span></div>
              <b>{money(goal.target)}</b>
              <div><button type="button" onClick={() => void toggleGoal(goal)}>{goal.active ? "Desativar" : "Ativar"}</button><button type="button" className="danger" onClick={() => void deleteGoal(goal)}>Excluir</button></div>
            </article>) : <p className="empty">Nenhuma meta financeira cadastrada para esta competência.</p>}
          </div>
        </section>
      </div>

      <section className="service-fin-goals-card service-fin-goals-client-card">
        <header><div><small>CLIENTES</small><h4>Meta, previsto e realizado por cliente</h4></div><strong>{clientRows.length} cliente(s)</strong></header>
        <div className="service-fin-goals-table">
          <div className="head"><span>Cliente</span><span>OS</span><span>Meta receita</span><span>Prev. receita</span><span>Real. receita</span><span>Ating.</span><span>Meta margem</span><span>Prev. margem</span><span>Real. margem</span><span>Ating.</span></div>
          {clientRows.length ? clientRows.map((item) => <div className="row" key={item.name}>
            <strong>{item.name}</strong><span>{item.calls}</span><span>{item.revenueGoal ? money(item.revenueGoal) : "—"}</span><span>{money(item.plannedRevenue)}</span><strong>{money(item.realizedRevenue)}</strong><span>{item.revenueGoal ? percent(item.revenueAchievement) : "—"}</span><span>{item.marginGoal ? money(item.marginGoal) : "—"}</span><span>{money(item.plannedMargin)}</span><strong className={item.realizedMargin < 0 ? "bad" : "good"}>{money(item.realizedMargin)}</strong><span>{item.marginGoal ? percent(item.marginAchievement) : "—"}</span>
          </div>) : <p className="empty">Nenhuma OS nesta competência.</p>}
        </div>
      </section>

      <footer className="service-fin-goals-note">
        <span>Meta = objetivo gerencial cadastrado. Previsto = planejamento financeiro das OS. Realizado = receita e custos efetivamente atribuídos às OS.</span>
        <span>As metas financeiras são protegidas pela permissão de Rentabilidade das OS.</span>
      </footer>
    </section>,
    target,
  );
}
