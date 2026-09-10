"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type ProfitRow = {
  id: number;
  companyName: string;
  createdAt: string;
  totalCost: number;
  revenueAmount: number | null;
  marginAmount: number | null;
  marginPercent: number | null;
  plannedMarginAmount: number | null;
  marginVariance: number | null;
};

type ProfitPayload = { rows: ProfitRow[] };

type ClientPortfolio = {
  name: string;
  calls: number;
  allocatedCalls: number;
  unallocatedCalls: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number | null;
  ticket: number | null;
  plannedMargin: number;
  comparableCalls: number;
  belowPlanCalls: number;
  marginVariance: number;
  hitRate: number | null;
  negativeCalls: number;
  lastAt: string;
};

function money(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(date);
}

function toMs(value: string) {
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : 0;
}

function aggregateClients(rows: ProfitRow[]) {
  const groups = new Map<string, ProfitRow[]>();
  rows.forEach((row) => {
    const name = row.companyName?.trim() || "Não informado";
    groups.set(name, [...(groups.get(name) ?? []), row]);
  });

  return [...groups.entries()].map(([name, items]): ClientPortfolio => {
    const allocated = items.filter((item) => item.revenueAmount !== null);
    const comparable = items.filter((item) => item.marginVariance !== null);
    const revenue = allocated.reduce((total, item) => total + (item.revenueAmount ?? 0), 0);
    const cost = allocated.reduce((total, item) => total + item.totalCost, 0);
    const margin = allocated.reduce((total, item) => total + (item.marginAmount ?? 0), 0);
    const plannedMargin = comparable.reduce((total, item) => total + (item.plannedMarginAmount ?? 0), 0);
    const marginVariance = comparable.reduce((total, item) => total + (item.marginVariance ?? 0), 0);
    const belowPlanCalls = comparable.filter((item) => (item.marginVariance ?? 0) < 0).length;
    const negativeCalls = allocated.filter((item) => (item.marginAmount ?? 0) < 0).length;
    const lastAt = items.reduce((latest, item) => toMs(item.createdAt) > toMs(latest) ? item.createdAt : latest, items[0]?.createdAt ?? "");

    return {
      name,
      calls: items.length,
      allocatedCalls: allocated.length,
      unallocatedCalls: items.length - allocated.length,
      revenue,
      cost,
      margin,
      marginPercent: revenue > 0 ? (margin / revenue) * 100 : null,
      ticket: allocated.length ? revenue / allocated.length : null,
      plannedMargin,
      comparableCalls: comparable.length,
      belowPlanCalls,
      marginVariance,
      hitRate: comparable.length ? comparable.filter((item) => (item.marginVariance ?? -Infinity) >= 0).length / comparable.length * 100 : null,
      negativeCalls,
      lastAt,
    };
  });
}

export function ServiceCallClientProfitabilitySection() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [payload, setPayload] = useState<ProfitPayload | null>(null);
  const [period, setPeriod] = useState<"90" | "180" | "365" | "all">("90");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const locate = () => setTarget(document.querySelector<HTMLElement>(".service-profit-dashboard"));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoading(true);
    void fetch("/api/service-call-profitability", { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 403) {
          setAuthorized(false);
          setPayload(null);
          return;
        }
        if (!response.ok) return;
        setAuthorized(true);
        setPayload((await response.json()) as ProfitPayload);
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [target]);

  const periodRows = useMemo(() => {
    const cutoff = period === "all" ? 0 : Date.now() - Number(period) * 86400000;
    return (payload?.rows ?? []).filter((row) => toMs(row.createdAt) >= cutoff);
  }, [payload, period]);

  const clients = useMemo(
    () => aggregateClients(periodRows).sort((a, b) => b.margin - a.margin || b.revenue - a.revenue),
    [periodRows],
  );

  const portfolio = useMemo(() => {
    const totalRevenue = clients.reduce((total, item) => total + item.revenue, 0);
    const totalCost = clients.reduce((total, item) => total + item.cost, 0);
    const totalMargin = clients.reduce((total, item) => total + item.margin, 0);
    const byRevenue = [...clients].sort((a, b) => b.revenue - a.revenue);
    const topThreeRevenue = byRevenue.slice(0, 3).reduce((total, item) => total + item.revenue, 0);
    const belowPlan = clients.filter((item) => item.comparableCalls > 0 && item.marginVariance < 0).length;
    const negative = clients.filter((item) => item.margin < 0).length;
    const unallocatedCalls = clients.reduce((total, item) => total + item.unallocatedCalls, 0);
    return {
      totalRevenue,
      totalCost,
      totalMargin,
      marginPercent: totalRevenue > 0 ? totalMargin / totalRevenue * 100 : null,
      concentration: totalRevenue > 0 ? topThreeRevenue / totalRevenue * 100 : null,
      belowPlan,
      negative,
      unallocatedCalls,
      byRevenue,
    };
  }, [clients]);

  const attention = useMemo(() => clients
    .filter((item) => item.margin < 0 || item.marginVariance < 0 || item.unallocatedCalls > 0)
    .sort((a, b) => {
      const severity = (item: ClientPortfolio) => item.margin < 0 ? 3 : item.marginVariance < 0 ? 2 : 1;
      return severity(b) - severity(a) || a.margin - b.margin;
    })
    .slice(0, 8), [clients]);

  const maxRevenue = Math.max(1, ...portfolio.byRevenue.map((item) => item.revenue));

  if (!target || authorized !== true) return null;

  return createPortal(
    <section className="service-client-profit-section">
      <header className="service-client-profit-header">
        <div>
          <small>CARTEIRA FINANCEIRA</small>
          <h3>Resultado por cliente</h3>
          <p>Visão consolidada da rentabilidade, aderência ao planejado e concentração da carteira.</p>
        </div>
        <label>
          <span>Período da carteira</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}>
            <option value="90">Últimos 90 dias</option>
            <option value="180">Últimos 180 dias</option>
            <option value="365">Últimos 12 meses</option>
            <option value="all">Todo o histórico</option>
          </select>
        </label>
      </header>

      <div className="service-client-profit-kpis">
        <article><span>Clientes com movimento</span><strong>{clients.length}</strong><small>{periodRows.length} OS no período</small></article>
        <article><span>Receita da carteira</span><strong>{money(portfolio.totalRevenue)}</strong><small>somente OS com receita atribuída</small></article>
        <article className={portfolio.totalMargin < 0 ? "danger" : "good"}><span>Margem da carteira</span><strong>{money(portfolio.totalMargin)}</strong><small>{percent(portfolio.marginPercent)} sobre a receita</small></article>
        <article className={portfolio.concentration !== null && portfolio.concentration >= 60 ? "warning" : ""}><span>Concentração Top 3</span><strong>{percent(portfolio.concentration)}</strong><small>participação dos 3 maiores na receita</small></article>
        <article className={portfolio.belowPlan ? "warning" : "good"}><span>Clientes abaixo do previsto</span><strong>{portfolio.belowPlan}</strong><small>resultado consolidado abaixo da margem planejada</small></article>
        <article className={portfolio.negative ? "danger" : "good"}><span>Clientes com margem negativa</span><strong>{portfolio.negative}</strong><small>{portfolio.unallocatedCalls} OS ainda sem receita atribuída</small></article>
      </div>

      <div className="service-client-profit-grid">
        <section className="service-client-profit-card">
          <header><div><small>CONCENTRAÇÃO</small><h4>Participação na receita</h4></div><strong>Top {Math.min(6, portfolio.byRevenue.length)}</strong></header>
          <div className="service-client-profit-concentration">
            {portfolio.byRevenue.slice(0, 6).map((item) => {
              const share = portfolio.totalRevenue > 0 ? item.revenue / portfolio.totalRevenue * 100 : 0;
              return <div key={item.name}>
                <div><strong>{item.name}</strong><span>{percent(share)} · {money(item.revenue)}</span></div>
                <i><b style={{ width: `${Math.max(2, item.revenue / maxRevenue * 100)}%` }} /></i>
              </div>;
            })}
            {!portfolio.byRevenue.length ? <p className="empty">Sem dados de receita para o período.</p> : null}
          </div>
        </section>

        <section className="service-client-profit-card">
          <header><div><small>ATENÇÃO</small><h4>Clientes que pedem revisão</h4></div><strong>{attention.length}</strong></header>
          <div className="service-client-profit-attention">
            {attention.length ? attention.map((item) => {
              const label = item.margin < 0 ? "Margem negativa" : item.marginVariance < 0 ? "Abaixo do planejado" : "OS sem receita";
              const detail = item.margin < 0 ? money(item.margin) : item.marginVariance < 0 ? `${money(item.marginVariance)} de desvio` : `${item.unallocatedCalls} OS sem receita`;
              return <article className={item.margin < 0 ? "danger" : "warning"} key={item.name}>
                <div><strong>{item.name}</strong><span>{item.calls} OS · última {dateLabel(item.lastAt)}</span></div>
                <b>{label}</b><span>{detail}</span>
              </article>;
            }) : <p className="empty">Nenhum cliente exige atenção nos critérios atuais.</p>}
          </div>
        </section>
      </div>

      <section className="service-client-profit-card service-client-profit-table-card">
        <header><div><small>CARTEIRA COMPLETA</small><h4>Rentabilidade e aderência por cliente</h4></div><strong>{clients.length} cliente(s)</strong></header>
        <div className="service-client-profit-table">
          <div className="head"><span>Cliente</span><span>OS</span><span>Receita</span><span>Custo</span><span>Margem</span><span>Margem %</span><span>Ticket</span><span>Previsto</span><span>Desvio</span><span>Aderência</span><span>Sem receita</span><span>Última OS</span></div>
          {clients.length ? clients.map((item) => <div className="row" key={item.name}>
            <div><strong>{item.name}</strong><small>{item.negativeCalls ? `${item.negativeCalls} OS com margem negativa` : "sem OS negativas"}</small></div>
            <span>{item.calls}</span><strong>{money(item.revenue)}</strong><span>{money(item.cost)}</span>
            <strong className={item.margin < 0 ? "bad" : "good"}>{money(item.margin)}</strong>
            <span className={item.margin < 0 ? "bad" : "good"}>{percent(item.marginPercent)}</span>
            <span>{money(item.ticket)}</span><span>{item.comparableCalls ? money(item.plannedMargin) : "—"}</span>
            <strong className={item.marginVariance < 0 ? "bad" : item.comparableCalls ? "good" : ""}>{item.comparableCalls ? money(item.marginVariance) : "—"}</strong>
            <span>{percent(item.hitRate)}</span><span className={item.unallocatedCalls ? "warn" : ""}>{item.unallocatedCalls}</span><span>{dateLabel(item.lastAt)}</span>
          </div>) : <p className="empty">Nenhum cliente com movimento no período selecionado.</p>}
        </div>
      </section>

      <footer className="service-client-profit-note">
        <span>Não há cadastro formal de contrato no TDK Manager neste momento; esta visão consolida cliente, vendas vinculadas e OS sem criar rateios artificiais.</span>
        <span>{loading ? "Atualizando carteira…" : "Dados protegidos pela mesma permissão de Rentabilidade das OS."}</span>
      </footer>
    </section>,
    target,
  );
}
