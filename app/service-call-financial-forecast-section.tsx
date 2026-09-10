"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Goal = {
  id: number;
  type: string;
  target: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  companyId: number | null;
};

type ProfitRow = {
  id: number;
  number: string;
  companyName: string;
  status: string;
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

type Forecast = {
  realizedRevenue: number;
  realizedMargin: number;
  pipelineRevenue: number;
  pipelineMargin: number;
  forecastRevenue: number;
  forecastMargin: number;
  adjustedRevenue: number;
  adjustedMargin: number;
  revenueGoal: number;
  marginGoal: number;
  revenueGap: number | null;
  marginGap: number | null;
  activeCalls: number;
  concludedCalls: number;
  plannedActiveCalls: number;
  fallbackActiveCalls: number;
  planCoverage: number | null;
};

const terminalStatuses = new Set(["concluido", "cancelado"]);

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

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function rowMonth(value: string) {
  const match = value.match(/^(\d{4}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonths(month: string, count: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, monthNumber - 2 - index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function overlapsMonth(goal: Goal, month: string) {
  const { start, end } = monthBounds(month);
  return goal.startsAt <= end && goal.endsAt >= start;
}

function clampFactor(value: number) {
  return Math.max(0, Math.min(1.25, value));
}

function forecastFor(rows: ProfitRow[], goals: Goal[], revenueFactor: number, marginFactor: number): Forecast {
  const concluded = rows.filter((row) => row.status === "concluido");
  const active = rows.filter((row) => !terminalStatuses.has(row.status));
  const realizedRevenue = concluded.reduce((total, row) => total + (row.revenueAmount ?? 0), 0);
  const realizedMargin = concluded.reduce((total, row) => total + (row.marginAmount ?? 0), 0);
  const pipelineRevenue = active.reduce((total, row) => total + (row.plannedRevenueAmount ?? row.revenueAmount ?? 0), 0);
  const pipelineMargin = active.reduce((total, row) => total + (row.plannedMarginAmount ?? row.marginAmount ?? 0), 0);
  const revenueGoal = goals.filter((goal) => goal.type === "service_revenue").reduce((total, goal) => total + goal.target, 0);
  const marginGoal = goals.filter((goal) => goal.type === "service_margin").reduce((total, goal) => total + goal.target, 0);
  const plannedActiveCalls = active.filter((row) => row.plannedRevenueAmount !== null).length;
  const fallbackActiveCalls = active.filter((row) => row.plannedRevenueAmount === null && row.revenueAmount !== null).length;
  const forecastRevenue = realizedRevenue + pipelineRevenue;
  const forecastMargin = realizedMargin + pipelineMargin;
  const adjustedRevenue = realizedRevenue + pipelineRevenue * revenueFactor;
  const adjustedMargin = realizedMargin + pipelineMargin * marginFactor;

  return {
    realizedRevenue,
    realizedMargin,
    pipelineRevenue,
    pipelineMargin,
    forecastRevenue,
    forecastMargin,
    adjustedRevenue,
    adjustedMargin,
    revenueGoal,
    marginGoal,
    revenueGap: revenueGoal > 0 ? adjustedRevenue - revenueGoal : null,
    marginGap: marginGoal > 0 ? adjustedMargin - marginGoal : null,
    activeCalls: active.length,
    concludedCalls: concluded.length,
    plannedActiveCalls,
    fallbackActiveCalls,
    planCoverage: active.length ? plannedActiveCalls / active.length * 100 : null,
  };
}

function gapClass(value: number | null) {
  if (value === null) return "";
  return value >= 0 ? "good" : "danger";
}

export function ServiceCallFinancialForecastSection() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [companyId, setCompanyId] = useState("");
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
        setMessage("Não foi possível calcular o forecast financeiro.");
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
      setMessage("Não foi possível calcular o forecast financeiro.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (target) void refresh();
  }, [target]);

  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);
  const selectedCompanyName = companyId ? companyById.get(Number(companyId)) ?? "" : "";

  const scopedRows = useMemo(() => rows.filter((row) => !selectedCompanyName || row.companyName === selectedCompanyName), [rows, selectedCompanyName]);
  const monthRows = useMemo(() => scopedRows.filter((row) => rowMonth(row.createdAt) === month), [scopedRows, month]);
  const monthGoals = useMemo(() => goals
    .filter((goal) => goal.active && overlapsMonth(goal, month))
    .filter((goal) => companyId ? goal.companyId === Number(companyId) : goal.companyId === null), [goals, month, companyId]);

  const historicalFactors = useMemo(() => {
    const keys = new Set(previousMonths(month, 3));
    const historical = scopedRows.filter((row) => row.status === "concluido" && keys.has(rowMonth(row.createdAt)));
    const revenueComparable = historical.filter((row) => (row.plannedRevenueAmount ?? 0) > 0 && row.revenueAmount !== null);
    const marginComparable = historical.filter((row) => (row.plannedMarginAmount ?? 0) > 0 && row.marginAmount !== null);
    const plannedRevenue = revenueComparable.reduce((total, row) => total + (row.plannedRevenueAmount ?? 0), 0);
    const actualRevenue = revenueComparable.reduce((total, row) => total + (row.revenueAmount ?? 0), 0);
    const plannedMargin = marginComparable.reduce((total, row) => total + (row.plannedMarginAmount ?? 0), 0);
    const actualMargin = marginComparable.reduce((total, row) => total + (row.marginAmount ?? 0), 0);
    return {
      revenue: plannedRevenue > 0 ? clampFactor(actualRevenue / plannedRevenue) : 1,
      margin: plannedMargin > 0 ? clampFactor(actualMargin / plannedMargin) : 1,
      revenueSamples: revenueComparable.length,
      marginSamples: marginComparable.length,
    };
  }, [scopedRows, month]);

  const forecast = useMemo(() => forecastFor(monthRows, monthGoals, historicalFactors.revenue, historicalFactors.margin), [monthRows, monthGoals, historicalFactors]);

  const clientForecasts = useMemo(() => {
    if (companyId) return [];
    const rowsThisMonth = rows.filter((row) => rowMonth(row.createdAt) === month);
    const names = [...new Set(rowsThisMonth.map((row) => row.companyName).filter(Boolean))];
    return names.map((name) => {
      const company = companies.find((item) => item.name === name);
      const clientRows = rowsThisMonth.filter((row) => row.companyName === name);
      const clientGoals = goals.filter((goal) => goal.active && overlapsMonth(goal, month) && goal.companyId === (company?.id ?? -1));
      const values = forecastFor(clientRows, clientGoals, 1, 1);
      return { name, ...values };
    }).sort((a, b) => {
      const aGap = a.revenueGap ?? Number.POSITIVE_INFINITY;
      const bGap = b.revenueGap ?? Number.POSITIVE_INFINITY;
      return aGap - bGap || b.forecastRevenue - a.forecastRevenue;
    });
  }, [rows, goals, companies, month, companyId]);

  const missingPlan = useMemo(() => monthRows
    .filter((row) => !terminalStatuses.has(row.status) && row.plannedRevenueAmount === null)
    .slice(0, 8), [monthRows]);

  const revenueAchievement = forecast.revenueGoal > 0 ? forecast.adjustedRevenue / forecast.revenueGoal * 100 : null;
  const marginAchievement = forecast.marginGoal > 0 ? forecast.adjustedMargin / forecast.marginGoal * 100 : null;
  const coverageLabel = forecast.activeCalls === 0 ? "Sem pipeline" : (forecast.planCoverage ?? 0) >= 80 ? "Alta" : (forecast.planCoverage ?? 0) >= 50 ? "Média" : "Baixa";

  if (!target || authorized !== true) return null;

  return createPortal(
    <section className="service-fin-forecast-section">
      <header className="service-fin-forecast-header">
        <div>
          <small>FORECAST FINANCEIRO</small>
          <h3>Projeção de fechamento</h3>
          <p>Consolida OS concluídas e projeta as OS em andamento pela previsão cadastrada, com ajuste pela aderência dos três meses anteriores quando houver histórico.</p>
        </div>
        <div className="service-fin-forecast-filters">
          <label><span>Competência</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <label><span>Escopo</span><select value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">Geral</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
        </div>
      </header>

      <div className="service-fin-forecast-kpis">
        <article><span>Realizado consolidado</span><strong>{money(forecast.realizedRevenue)}</strong><small>{forecast.concludedCalls} OS concluída(s) · {monthLabel(month)}</small></article>
        <article><span>Pipeline em andamento</span><strong>{money(forecast.pipelineRevenue)}</strong><small>{forecast.activeCalls} OS ativa(s) consideradas</small></article>
        <article className={gapClass(forecast.revenueGap)}><span>Forecast de receita</span><strong>{money(forecast.adjustedRevenue)}</strong><small>{forecast.revenueGoal ? `${percent(revenueAchievement)} da meta de ${money(forecast.revenueGoal)}` : "sem meta de receita cadastrada"}</small></article>
        <article className={gapClass(forecast.revenueGap)}><span>Gap projetado de receita</span><strong>{money(forecast.revenueGap)}</strong><small>{forecast.revenueGap === null ? "cadastre uma meta para medir o gap" : forecast.revenueGap >= 0 ? "projeção acima da meta" : "valor ainda necessário para a meta"}</small></article>
        <article className={gapClass(forecast.marginGap)}><span>Forecast de margem</span><strong>{money(forecast.adjustedMargin)}</strong><small>{forecast.marginGoal ? `${percent(marginAchievement)} da meta de ${money(forecast.marginGoal)}` : "sem meta de margem cadastrada"}</small></article>
        <article className={(forecast.planCoverage ?? 100) < 50 ? "warning" : ""}><span>Cobertura do planejamento</span><strong>{percent(forecast.planCoverage)}</strong><small>{coverageLabel} · {forecast.plannedActiveCalls} de {forecast.activeCalls} OS com previsão</small></article>
      </div>

      <div className="service-fin-forecast-grid">
        <section className="service-fin-forecast-card">
          <header><div><small>COMPOSIÇÃO</small><h4>Como a projeção foi formada</h4></div><strong>{monthLabel(month)}</strong></header>
          <div className="service-fin-forecast-composition">
            <article><span>Receita concluída</span><strong>{money(forecast.realizedRevenue)}</strong><i><b style={{ width: `${Math.min(100, forecast.forecastRevenue ? forecast.realizedRevenue / forecast.forecastRevenue * 100 : 0)}%` }} /></i></article>
            <article><span>Potencial das OS ativas</span><strong>{money(forecast.pipelineRevenue)}</strong><i><b style={{ width: `${Math.min(100, forecast.forecastRevenue ? forecast.pipelineRevenue / forecast.forecastRevenue * 100 : 0)}%` }} /></i></article>
            <article><span>Forecast base</span><strong>{money(forecast.forecastRevenue)}</strong><small>concluído + potencial cadastrado</small></article>
            <article><span>Forecast ajustado</span><strong>{money(forecast.adjustedRevenue)}</strong><small>fator histórico de receita: {percent(historicalFactors.revenue * 100)} · {historicalFactors.revenueSamples} amostra(s)</small></article>
          </div>
        </section>

        <section className="service-fin-forecast-card">
          <header><div><small>QUALIDADE DA PROJEÇÃO</small><h4>Base disponível para o fechamento</h4></div><strong>{coverageLabel}</strong></header>
          <div className="service-fin-forecast-quality">
            <article><span>OS ativas com previsão</span><strong>{forecast.plannedActiveCalls}</strong></article>
            <article><span>OS usando valor disponível sem previsão formal</span><strong>{forecast.fallbackActiveCalls}</strong></article>
            <article><span>OS ativas sem previsão de receita</span><strong>{missingPlan.length}</strong></article>
            <article><span>Fator histórico de margem</span><strong>{percent(historicalFactors.margin * 100)}</strong><small>{historicalFactors.marginSamples} amostra(s) comparáveis</small></article>
          </div>
          {missingPlan.length ? <div className="service-fin-forecast-missing"><strong>Completar planejamento</strong>{missingPlan.map((row) => <span key={row.id}>{row.number} · {row.companyName}</span>)}</div> : <p className="service-fin-forecast-ok">Todas as OS ativas da competência possuem previsão de receita.</p>}
        </section>
      </div>

      {!companyId ? <section className="service-fin-forecast-card service-fin-forecast-table-card">
        <header><div><small>FECHAMENTO POR CLIENTE</small><h4>Quem ajuda ou pressiona a meta do mês</h4></div><strong>{clientForecasts.length} cliente(s)</strong></header>
        <div className="service-fin-forecast-table">
          <div className="head"><span>Cliente</span><span>Consolidado</span><span>Em andamento</span><span>Forecast</span><span>Meta receita</span><span>Gap receita</span><span>Forecast margem</span><span>Meta margem</span><span>Gap margem</span><span>Cobertura</span></div>
          {clientForecasts.length ? clientForecasts.map((item) => <div className="row" key={item.name}>
            <div><strong>{item.name}</strong><small>{item.concludedCalls} concluída(s) · {item.activeCalls} ativa(s)</small></div>
            <span>{money(item.realizedRevenue)}</span><span>{money(item.pipelineRevenue)}</span><strong>{money(item.forecastRevenue)}</strong>
            <span>{item.revenueGoal ? money(item.revenueGoal) : "—"}</span><strong className={gapClass(item.revenueGap)}>{money(item.revenueGap)}</strong>
            <span>{money(item.forecastMargin)}</span><span>{item.marginGoal ? money(item.marginGoal) : "—"}</span><strong className={gapClass(item.marginGap)}>{money(item.marginGap)}</strong><span>{percent(item.planCoverage)}</span>
          </div>) : <p className="empty">Nenhuma OS encontrada para a competência selecionada.</p>}
        </div>
      </section> : null}

      <footer className="service-fin-forecast-note">
        <span>Forecast operacional: considera a competência pela data de abertura da OS; não representa previsão de caixa ou recebimento.</span>
        <span>{message || "Dados protegidos pela permissão Rentabilidade das OS."}</span>
      </footer>
    </section>,
    target,
  );
}
