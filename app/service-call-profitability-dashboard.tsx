"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type ProfitRow = {
  id: number;
  number: string;
  companyName: string;
  technician: string | null;
  status: string;
  saleId: number | null;
  createdAt: string;
  materialCost: number;
  serviceCost: number;
  equipmentCost: number;
  expenseCost: number;
  totalCost: number;
  revenueAmount: number | null;
  revenueSource: string;
  estimated: boolean;
  marginAmount: number | null;
  marginPercent: number | null;
  plannedRevenueAmount: number | null;
  plannedCostAmount: number | null;
  plannedMarginAmount: number | null;
  plannedMarginPercent: number | null;
  plannedSource: string;
  revenueVariance: number | null;
  costVariance: number | null;
  marginVariance: number | null;
  marginPointVariance: number | null;
  notes: string | null;
  revenueOverride: number | null;
  plannedRevenueOverride: number | null;
  plannedCostOverride: number | null;
};

type ProfitPayload = {
  rows: ProfitRow[];
  summary: {
    totalRevenue: number;
    totalCost: number;
    allocatedCost: number;
    totalMargin: number;
    marginPercent: number | null;
    allocatedCalls: number;
    unallocatedCalls: number;
    plannedCalls: number;
    comparableCalls: number;
    totalPlannedMargin: number;
    totalMarginVariance: number;
  };
};

type ResultFilter = "all" | "negative" | "unallocated" | "below_plan" | "no_plan" | "active" | "concluded";

const statusLabels: Record<string, string> = {
  aberto: "Aberto",
  acionado: "Acionado",
  confirmado: "Confirmado",
  deslocamento: "Deslocamento",
  atendimento: "Em atendimento",
  pendente: "Pendente",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
const terminalStatuses = new Set(["concluido", "cancelado"]);

function serviceViewVisible() {
  if (document.querySelector(".service-column, .service-call-card, .service-call-sheet")) return true;
  return Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3")).some((node) =>
    /chamados|ordens de servi[cç]o/i.test(node.textContent ?? ""),
  );
}
function findHeaderTarget() {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) =>
    /novo chamado/i.test(item.textContent ?? ""),
  );
  return button?.parentElement ?? null;
}
function money(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1).replace(".", ",")}%`;
}
function points(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1).replace(".", ",")} p.p.`;
}
function toMs(value: string) {
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : 0;
}
function monthKey(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" })
    .format(new Date(year, month - 1, 1))
    .replace(" de ", "/");
}
function inputAmount(value: string) {
  if (!value.trim()) return null;
  return Number(value.replace(",", "."));
}

export function ServiceCallProfitabilityDashboard() {
  const [visible, setVisible] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<ProfitPayload | null>(null);
  const [period, setPeriod] = useState<"30" | "90" | "all">("30");
  const [client, setClient] = useState("");
  const [technician, setTechnician] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [editing, setEditing] = useState<ProfitRow | null>(null);
  const [revenue, setRevenue] = useState("");
  const [plannedRevenue, setPlannedRevenue] = useState("");
  const [plannedCost, setPlannedCost] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const apply = () => {
      setVisible(serviceViewVisible());
      setHeaderTarget(findHeaderTarget());
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/service-call-profitability", { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      if (!response.ok) {
        setMessage("Não foi possível carregar a rentabilidade das OS.");
        return;
      }
      const data = (await response.json()) as ProfitPayload;
      setAuthorized(true);
      setPayload(data);
      setMessage("");
    } catch {
      setMessage("Não foi possível carregar a rentabilidade das OS.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!visible || authorized !== null) return;
    void refresh(true);
  }, [visible, authorized]);
  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  const clientOptions = useMemo(
    () => [...new Set((payload?.rows ?? []).map((row) => row.companyName).filter(Boolean))].sort(),
    [payload],
  );
  const technicianOptions = useMemo(
    () => [...new Set((payload?.rows ?? []).map((row) => row.technician?.trim()).filter(Boolean) as string[])].sort(),
    [payload],
  );
  const scopedRows = useMemo(() => {
    const cutoff = period === "all" ? 0 : Date.now() - Number(period) * 86400000;
    return (payload?.rows ?? [])
      .filter((row) => toMs(row.createdAt) >= cutoff)
      .filter((row) => !client || row.companyName === client)
      .filter((row) => !technician || (row.technician?.trim() || "") === technician);
  }, [payload, period, client, technician]);
  const rows = useMemo(() => scopedRows
    .filter((row) => {
      if (resultFilter === "negative") return row.marginAmount !== null && row.marginAmount < 0;
      if (resultFilter === "unallocated") return row.revenueAmount === null;
      if (resultFilter === "below_plan") return row.marginVariance !== null && row.marginVariance < 0;
      if (resultFilter === "no_plan") return row.plannedMarginAmount === null;
      if (resultFilter === "active") return !terminalStatuses.has(row.status);
      if (resultFilter === "concluded") return row.status === "concluido";
      return true;
    })
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)), [scopedRows, resultFilter]);

  const summary = useMemo(() => {
    const allocated = rows.filter((row) => row.revenueAmount !== null);
    const comparable = rows.filter((row) => row.marginVariance !== null);
    const revenueValue = allocated.reduce((total, row) => total + (row.revenueAmount ?? 0), 0);
    const allocatedCost = allocated.reduce((total, row) => total + row.totalCost, 0);
    const allCost = rows.reduce((total, row) => total + row.totalCost, 0);
    const margin = revenueValue - allocatedCost;
    const plannedMargin = comparable.reduce((total, row) => total + (row.plannedMarginAmount ?? 0), 0);
    const actualComparableMargin = comparable.reduce((total, row) => total + (row.marginAmount ?? 0), 0);
    const variance = actualComparableMargin - plannedMargin;
    return {
      revenue: revenueValue,
      allCost,
      allocatedCost,
      margin,
      marginPercent: revenueValue > 0 ? (margin / revenueValue) * 100 : null,
      allocated: allocated.length,
      unallocated: rows.length - allocated.length,
      materials: rows.reduce((total, row) => total + row.materialCost, 0),
      services: rows.reduce((total, row) => total + row.serviceCost, 0),
      equipment: rows.reduce((total, row) => total + row.equipmentCost, 0),
      expenses: rows.reduce((total, row) => total + row.expenseCost, 0),
      ticket: allocated.length ? revenueValue / allocated.length : null,
      costRatio: revenueValue > 0 ? (allocatedCost / revenueValue) * 100 : null,
      planned: rows.filter((row) => row.plannedMarginAmount !== null).length,
      comparable: comparable.length,
      plannedMargin,
      actualComparableMargin,
      variance,
      hitRate: comparable.length ? comparable.filter((row) => (row.marginVariance ?? -Infinity) >= 0).length / comparable.length * 100 : null,
    };
  }, [rows]);

  const attentionRows = useMemo(() => rows
    .filter((row) =>
      (row.marginAmount !== null && row.marginAmount < 0) ||
      (row.revenueAmount === null && row.totalCost > 0) ||
      (row.marginVariance !== null && row.marginVariance < 0),
    )
    .sort((a, b) => {
      const score = (row: ProfitRow) => row.marginAmount !== null && row.marginAmount < 0 ? 3 : row.marginVariance !== null && row.marginVariance < 0 ? 2 : 1;
      return score(b) - score(a) || (a.marginVariance ?? a.marginAmount ?? 0) - (b.marginVariance ?? b.marginAmount ?? 0);
    })
    .slice(0, 10), [rows]);

  const comparisonRows = useMemo(() => rows
    .filter((row) => row.plannedRevenueAmount !== null || row.plannedCostAmount !== null)
    .sort((a, b) => Math.abs(b.marginVariance ?? 0) - Math.abs(a.marginVariance ?? 0))
    .slice(0, 30), [rows]);

  const trend = useMemo(() => {
    const buckets = new Map<string, { revenue: number; cost: number; margin: number; calls: number }>();
    rows.forEach((row) => {
      const key = monthKey(row.createdAt);
      if (!key) return;
      const current = buckets.get(key) ?? { revenue: 0, cost: 0, margin: 0, calls: 0 };
      current.calls += 1;
      current.cost += row.totalCost;
      if (row.revenueAmount !== null) {
        current.revenue += row.revenueAmount;
        current.margin += row.marginAmount ?? 0;
      }
      buckets.set(key, current);
    });
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6)
      .map(([key, values]) => ({ key, label: monthLabel(key), ...values }));
  }, [rows]);
  const trendScale = useMemo(() => Math.max(1, ...trend.flatMap((item) => [item.revenue, item.cost, Math.abs(item.margin)])), [trend]);

  const byClient = useMemo(() => {
    const map = new Map<string, ProfitRow[]>();
    rows.forEach((row) => map.set(row.companyName || "Não informado", [...(map.get(row.companyName || "Não informado") ?? []), row]));
    return [...map.entries()].map(([name, items]) => {
      const allocated = items.filter((item) => item.revenueAmount !== null);
      const revenueValue = allocated.reduce((total, item) => total + (item.revenueAmount ?? 0), 0);
      const cost = allocated.reduce((total, item) => total + item.totalCost, 0);
      const margin = revenueValue - cost;
      return { name, calls: items.length, revenue: revenueValue, margin, marginPercent: revenueValue > 0 ? margin / revenueValue * 100 : null };
    }).sort((a, b) => b.margin - a.margin).slice(0, 8);
  }, [rows]);

  function startEdit(row: ProfitRow) {
    setEditing(row);
    setRevenue(row.revenueOverride === null ? "" : String(row.revenueOverride));
    setPlannedRevenue(row.plannedRevenueOverride === null ? "" : String(row.plannedRevenueOverride));
    setPlannedCost(row.plannedCostOverride === null ? "" : String(row.plannedCostOverride));
    setNotes(row.notes ?? "");
    setMessage("");
  }

  async function saveRevenue() {
    if (!editing) return;
    const revenueValue = inputAmount(revenue);
    const plannedRevenueValue = inputAmount(plannedRevenue);
    const plannedCostValue = inputAmount(plannedCost);
    if ([revenueValue, plannedRevenueValue, plannedCostValue].some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
      setMessage("Informe valores financeiros válidos ou deixe em branco para usar o cálculo automático disponível.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/service-call-profitability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceCallId: editing.id,
          revenueAmount: revenueValue,
          plannedRevenueAmount: plannedRevenueValue,
          plannedCostAmount: plannedCostValue,
          notes,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível atualizar os dados financeiros da OS.");
        return;
      }
      setEditing(null);
      setMessage("Planejamento e realizado da OS atualizados.");
      await refresh(true);
    } finally {
      setLoading(false);
    }
  }

  if (!visible || authorized !== true) return null;
  const trigger = <button type="button" className="service-profit-trigger" onClick={() => setOpen(true)}><span>FINANCEIRO</span><strong>Rentabilidade OS</strong></button>;

  return <>
    {headerTarget ? createPortal(trigger, headerTarget) : trigger}
    {open ? <div className="service-profit-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="service-profit-dashboard" role="dialog" aria-modal="true" aria-label="Rentabilidade das ordens de serviço">
        <header className="service-profit-header">
          <div><small>CHAMADOS E ORDENS DE SERVIÇO</small><h2>Rentabilidade por OS</h2><p>Receita, custos, margem e comparação previsto x realizado com acesso protegido por permissão.</p></div>
          <div><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button><button type="button" className="service-profit-close" onClick={() => setOpen(false)} aria-label="Fechar">×</button></div>
        </header>

        <div className="service-profit-filters">
          <label><span>Período</span><select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="all">Todo o histórico</option></select></label>
          <label><span>Cliente</span><select value={client} onChange={(event) => setClient(event.target.value)}><option value="">Todos</option>{clientOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>Técnico</span><select value={technician} onChange={(event) => setTechnician(event.target.value)}><option value="">Todos</option>{technicianOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>Situação financeira</span><select value={resultFilter} onChange={(event) => setResultFilter(event.target.value as ResultFilter)}><option value="all">Todas as OS</option><option value="negative">Margem negativa</option><option value="below_plan">Abaixo do previsto</option><option value="unallocated">Sem receita atribuída</option><option value="no_plan">Sem planejamento</option><option value="active">Em andamento</option><option value="concluded">Concluídas</option></select></label>
          <button type="button" onClick={() => { setClient(""); setTechnician(""); setResultFilter("all"); }}>Limpar filtros</button>
        </div>

        <div className="service-profit-kpis">
          <article><span>Receita considerada</span><strong>{money(summary.revenue)}</strong><small>{summary.allocated} OS com receita definida</small></article>
          <article><span>Custos registrados</span><strong>{money(summary.allCost)}</strong><small>todas as OS filtradas</small></article>
          <article className={summary.margin < 0 ? "danger" : "good"}><span>Margem operacional</span><strong>{money(summary.margin)}</strong><small>sobre OS com receita atribuída</small></article>
          <article className={summary.marginPercent !== null && summary.marginPercent < 0 ? "danger" : "good"}><span>Margem %</span><strong>{percent(summary.marginPercent)}</strong><small>receita menos custos diretos</small></article>
          <article className={summary.unallocated ? "warning" : ""}><span>Sem receita atribuída</span><strong>{summary.unallocated}</strong><small>não entram na margem consolidada</small></article>
          <article><span>Ticket médio por OS</span><strong>{money(summary.ticket)}</strong><small>somente OS com receita</small></article>
          <article className={summary.costRatio !== null && summary.costRatio > 100 ? "danger" : ""}><span>Custo / receita</span><strong>{percent(summary.costRatio)}</strong><small>quanto da receita virou custo direto</small></article>
        </div>

        <div className="service-profit-plan-kpis">
          <article><span>Margem prevista</span><strong>{money(summary.plannedMargin)}</strong><small>{summary.comparable} OS comparáveis</small></article>
          <article><span>Margem realizada comparável</span><strong>{money(summary.actualComparableMargin)}</strong><small>mesma base do planejamento</small></article>
          <article className={summary.variance < 0 ? "danger" : "good"}><span>Desvio de margem</span><strong>{money(summary.variance)}</strong><small>{summary.variance < 0 ? "abaixo" : "acima"} do previsto</small></article>
          <article className={summary.hitRate !== null && summary.hitRate < 70 ? "warning" : "good"}><span>Aderência ao plano</span><strong>{percent(summary.hitRate)}</strong><small>OS que atingiram ou superaram a margem</small></article>
          <article className={summary.planned < rows.length ? "warning" : ""}><span>OS com planejamento</span><strong>{summary.planned}/{rows.length}</strong><small>cobertura do comparativo</small></article>
        </div>

        <div className="service-profit-costs">
          <div><span>Materiais</span><strong>{money(summary.materials)}</strong></div><div><span>Serviços / mão de obra</span><strong>{money(summary.services)}</strong></div><div><span>Equipamentos / peças</span><strong>{money(summary.equipment)}</strong></div><div><span>Despesas</span><strong>{money(summary.expenses)}</strong></div>
        </div>

        {editing ? <section className="service-profit-editor service-profit-plan-editor">
          <div><small>PLANEJAMENTO E REALIZADO</small><h3>{editing.number} · {editing.companyName}</h3><p>Campos vazios usam automaticamente a venda quando ela pertence somente a esta OS. Em vendas com várias OS, informe o rateio previsto.</p></div>
          <label><span>Receita realizada</span><input inputMode="decimal" placeholder="Automático" value={revenue} onChange={(event) => setRevenue(event.target.value)} /></label>
          <label><span>Receita prevista</span><input inputMode="decimal" placeholder="Venda / rateio" value={plannedRevenue} onChange={(event) => setPlannedRevenue(event.target.value)} /></label>
          <label><span>Custo previsto</span><input inputMode="decimal" placeholder="Venda / rateio" value={plannedCost} onChange={(event) => setPlannedCost(event.target.value)} /></label>
          <label><span>Observação</span><input placeholder="Contrato, medição, rateio..." value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button type="button" className="primary" onClick={() => void saveRevenue()} disabled={loading}>Salvar</button></div>
        </section> : null}
        {message ? <p className="service-profit-message">{message}</p> : null}

        <section className="service-profit-card service-profit-plan-card">
          <header><div><small>PREVISTO X REALIZADO</small><h3>Desvio financeiro por ordem de serviço</h3></div><strong>{comparisonRows.length} OS com referência</strong></header>
          <div className="service-profit-plan-table">
            <div className="head"><span>OS / origem</span><span>Receita prevista</span><span>Receita realizada</span><span>Custo previsto</span><span>Custo realizado</span><span>Margem prevista</span><span>Margem realizada</span><span>Desvio</span><span>Δ margem %</span><span></span></div>
            {comparisonRows.length ? comparisonRows.map((row) => <div className="row" key={row.id}>
              <div><strong>{row.number}</strong><small>{row.plannedSource}</small></div>
              <span>{money(row.plannedRevenueAmount)}</span><span>{money(row.revenueAmount)}</span><span>{money(row.plannedCostAmount)}</span><span>{money(row.totalCost)}</span>
              <strong>{money(row.plannedMarginAmount)}</strong><strong className={row.marginAmount !== null && row.marginAmount < 0 ? "bad" : ""}>{money(row.marginAmount)}</strong>
              <strong className={row.marginVariance !== null && row.marginVariance < 0 ? "bad" : row.marginVariance !== null ? "good" : ""}>{money(row.marginVariance)}</strong>
              <span className={row.marginPointVariance !== null && row.marginPointVariance < 0 ? "bad" : row.marginPointVariance !== null ? "good" : ""}>{points(row.marginPointVariance)}</span>
              <button type="button" onClick={() => startEdit(row)}>Ajustar</button>
            </div>) : <p className="empty">Ainda não há OS com planejamento financeiro comparável. Vincule uma venda ou atribua receita/custo previstos.</p>}
          </div>
        </section>

        <section className="service-profit-card service-profit-trend-card">
          <header><div><small>EVOLUÇÃO FINANCEIRA</small><h3>Receita x custo x margem</h3></div><strong>últimos {trend.length} meses com movimento</strong></header>
          {trend.length ? <div className="service-profit-trend">{trend.map((item) => <div className="service-profit-trend-row" key={item.key}><strong>{item.label}</strong><div className="service-profit-trend-series">
            <div><span>Receita</span><i className="revenue" style={{ width: `${Math.max(2, item.revenue / trendScale * 100)}%` }} /><b>{money(item.revenue)}</b></div>
            <div><span>Custo</span><i className="cost" style={{ width: `${Math.max(2, item.cost / trendScale * 100)}%` }} /><b>{money(item.cost)}</b></div>
            <div><span>Margem</span><i className={item.margin < 0 ? "margin negative" : "margin"} style={{ width: `${Math.max(2, Math.abs(item.margin) / trendScale * 100)}%` }} /><b className={item.margin < 0 ? "bad" : "good"}>{money(item.margin)}</b></div>
          </div></div>)}</div> : <p className="empty">Ainda não há dados suficientes para montar a evolução financeira.</p>}
        </section>

        <section className="service-profit-card service-profit-attention-card">
          <header><div><small>ATENÇÃO FINANCEIRA</small><h3>OS que precisam de revisão</h3></div><strong>{attentionRows.length} prioridade(s)</strong></header>
          {attentionRows.length ? <div className="service-profit-attention-grid">{attentionRows.map((row) => {
            const negative = row.marginAmount !== null && row.marginAmount < 0;
            const belowPlan = !negative && row.marginVariance !== null && row.marginVariance < 0;
            return <article className={negative || belowPlan ? "danger" : "warning"} key={row.id}>
              <div><strong>{row.number}</strong><span>{row.companyName}</span></div>
              <b>{negative ? "Margem negativa" : belowPlan ? "Margem abaixo do previsto" : "Custo sem receita atribuída"}</b>
              <span>{negative ? `${money(row.marginAmount)} · ${percent(row.marginPercent)}` : belowPlan ? `${money(row.marginVariance)} de desvio` : `${money(row.totalCost)} em custos registrados`}</span>
              <button type="button" onClick={() => startEdit(row)}>Revisar OS</button>
            </article>;
          })}</div> : <p className="empty">Nenhuma OS crítica nos filtros atuais.</p>}
        </section>

        <section className="service-profit-card">
          <header><div><small>DETALHAMENTO</small><h3>Resultado por ordem de serviço</h3></div><strong>{rows.length} OS</strong></header>
          <div className="service-profit-table">
            <div className="head"><span>OS</span><span>Cliente</span><span>Técnico</span><span>Receita</span><span>Custos</span><span>Margem</span><span>%</span><span>Origem</span><span></span></div>
            {rows.length ? rows.map((row) => <div className="row" key={row.id}>
              <div><strong>{row.number}</strong><small>{statusLabels[row.status] ?? row.status}</small></div><span>{row.companyName}</span><span>{row.technician || "Não atribuído"}</span>
              <strong>{money(row.revenueAmount)}</strong><span>{money(row.totalCost)}</span><strong className={row.marginAmount !== null && row.marginAmount < 0 ? "bad" : row.marginAmount !== null ? "good" : ""}>{money(row.marginAmount)}</strong>
              <span className={row.marginPercent !== null && row.marginPercent < 0 ? "bad" : row.marginPercent !== null ? "good" : ""}>{percent(row.marginPercent)}</span>
              <span title={row.estimated ? "Estimativa baseada nos itens lançados na OS" : row.revenueSource}>{row.revenueSource}{row.estimated ? " · estimado" : ""}</span><button type="button" onClick={() => startEdit(row)}>Editar</button>
            </div>) : <p className="empty">Nenhuma OS no período selecionado.</p>}
          </div>
        </section>

        <section className="service-profit-card service-profit-client-card">
          <header><div><small>CLIENTES</small><h3>Ranking de margem por cliente</h3></div></header>
          <div className="service-profit-client-grid">{byClient.length ? byClient.map((item, index) => <article key={item.name}><small>#{index + 1}</small><strong>{item.name}</strong><span>{item.calls} OS</span><em>{money(item.revenue)} receita</em><b className={item.margin < 0 ? "bad" : "good"}>{money(item.margin)} · {percent(item.marginPercent)}</b></article>) : <p className="empty">Sem dados.</p>}</div>
        </section>

        <footer className="service-profit-footer"><span>Planejado: venda exclusiva da OS ou rateio manual. Vendas com várias OS não são rateadas automaticamente.</span><span>Realizado: receita atribuída/venda/itens e custos efetivamente registrados na OS.</span></footer>
      </section>
    </div> : null}
  </>;
}
