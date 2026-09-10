"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type ServiceCall = {
  id: number;
  number: string;
  companyName: string;
  technician: string | null;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
};

type HistoryItem = {
  id: number;
  serviceCallId: number;
  toStatus: string;
  createdAt: string;
};

type Pendency = {
  id: number;
  serviceCallId: number;
  startedAt: string;
  endedAt: string | null;
};

type ServiceData = {
  calls: ServiceCall[];
  history: HistoryItem[];
  pendencies: Pendency[];
};

type TrendPoint = {
  key: string;
  label: string;
  opened: number;
  closed: number;
};

function toMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function conclusionAt(callId: number, history: HistoryItem[]) {
  const event = history
    .filter((item) => item.serviceCallId === callId && item.toStatus === "concluido")
    .sort((a, b) => (toMs(a.createdAt) ?? 0) - (toMs(b.createdAt) ?? 0))
    .at(-1);
  return toMs(event?.createdAt);
}

function formatDuration(ms: number | null) {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

function dayKey(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildTrend(calls: ServiceCall[], history: HistoryItem[], period: string, now: number): TrendPoint[] {
  if (period === "all") {
    const rows = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now);
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      date.setMonth(date.getMonth() - (11 - index));
      const ms = date.getTime();
      return {
        key: monthKey(ms),
        label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),
        opened: 0,
        closed: 0,
      };
    });
    const map = new Map(rows.map((row) => [row.key, row]));
    calls.forEach((call) => {
      const created = toMs(call.createdAt);
      if (created !== null) map.get(monthKey(created))!.opened += map.has(monthKey(created)) ? 1 : 0;
      const concluded = conclusionAt(call.id, history);
      if (concluded !== null && map.has(monthKey(concluded))) map.get(monthKey(concluded))!.closed += 1;
    });
    return rows;
  }

  const days = period === "7" ? 7 : period === "90" ? 90 : 30;
  const rows = Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - 1 - index));
    const ms = date.getTime();
    return {
      key: dayKey(ms),
      label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date),
      opened: 0,
      closed: 0,
    };
  });
  const map = new Map(rows.map((row) => [row.key, row]));
  calls.forEach((call) => {
    const created = toMs(call.createdAt);
    if (created !== null) {
      const row = map.get(dayKey(created));
      if (row) row.opened += 1;
    }
    const concluded = conclusionAt(call.id, history);
    if (concluded !== null) {
      const row = map.get(dayKey(concluded));
      if (row) row.closed += 1;
    }
  });

  if (period !== "90") return rows;

  const weekly: TrendPoint[] = [];
  for (let start = 0; start < rows.length; start += 7) {
    const slice = rows.slice(start, start + 7);
    weekly.push({
      key: slice[0]?.key ?? String(start),
      label: slice.at(-1)?.label ?? "",
      opened: slice.reduce((sum, item) => sum + item.opened, 0),
      closed: slice.reduce((sum, item) => sum + item.closed, 0),
    });
  }
  return weekly;
}

function linePoints(values: number[], max: number) {
  if (!values.length) return "";
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 92 - (value / Math.max(1, max)) * 78;
      return `${x},${y}`;
    })
    .join(" ");
}

export function ServiceCallSlaOperationsSection() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<ServiceData>({ calls: [], history: [], pendencies: [] });
  const [period, setPeriod] = useState("30");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let currentSelect: HTMLSelectElement | null = null;

    const sync = () => {
      const grid = document.querySelector<HTMLElement>(".service-sla-dashboard .service-sla-grid");
      setTarget(grid);

      const select = document.querySelector<HTMLSelectElement>(".service-sla-dashboard .service-sla-controls select");
      if (select !== currentSelect) {
        currentSelect?.removeEventListener("change", sync);
        currentSelect = select;
        currentSelect?.addEventListener("change", sync);
      }
      if (select?.value) setPeriod(select.value);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      currentSelect?.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/service-calls", { cache: "no-store" });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as Partial<ServiceData>;
        if (!active) return;
        setData({ calls: payload.calls ?? [], history: payload.history ?? [], pendencies: payload.pendencies ?? [] });
        setNow(Date.now());
      } catch {
        // O painel de SLA principal continua funcionando mesmo sem este complemento.
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [target]);

  const activeCalls = useMemo(
    () => data.calls.filter((call) => call.status !== "concluido" && call.status !== "cancelado"),
    [data.calls],
  );

  const metrics = useMemo(() => {
    const days = period === "7" ? 7 : period === "90" ? 90 : period === "all" ? null : 30;
    const cutoff = days === null ? 0 : now - days * 86400000;
    const completed = data.calls.filter((call) => {
      const concluded = conclusionAt(call.id, data.history);
      return concluded !== null && concluded >= cutoff;
    });
    const cycleValues = completed
      .map((call) => {
        const created = toMs(call.createdAt);
        const concluded = conclusionAt(call.id, data.history);
        return created !== null && concluded !== null ? Math.max(0, concluded - created) : null;
      })
      .filter((value): value is number => value !== null);
    const openPendencies = data.pendencies.filter((item) => !item.endedAt);
    const overdue = activeCalls.filter((call) => {
      const scheduled = toMs(call.scheduledAt);
      return scheduled !== null && scheduled < now && conclusionAt(call.id, data.history) === null;
    });
    return {
      backlog: activeCalls.length,
      pending: openPendencies.length,
      overdue: overdue.length,
      completed: completed.length,
      avgCycle: cycleValues.length ? cycleValues.reduce((sum, value) => sum + value, 0) / cycleValues.length : null,
    };
  }, [activeCalls, data.calls, data.history, data.pendencies, now, period]);

  const trend = useMemo(() => buildTrend(data.calls, data.history, period, now), [data.calls, data.history, period, now]);
  const trendMax = Math.max(1, ...trend.flatMap((item) => [item.opened, item.closed]));
  const openedPoints = linePoints(trend.map((item) => item.opened), trendMax);
  const closedPoints = linePoints(trend.map((item) => item.closed), trendMax);

  const technicianRows = useMemo(() => {
    const map = new Map<string, ServiceCall[]>();
    activeCalls.forEach((call) => {
      const key = call.technician?.trim() || "Não atribuído";
      map.set(key, [...(map.get(key) ?? []), call]);
    });
    return [...map.entries()]
      .map(([name, calls]) => ({ name, active: calls.length, pending: calls.filter((call) => call.status === "pendente").length }))
      .sort((a, b) => b.active - a.active)
      .slice(0, 8);
  }, [activeCalls]);

  const clientRows = useMemo(() => {
    const map = new Map<string, ServiceCall[]>();
    activeCalls.forEach((call) => {
      const key = call.companyName?.trim() || "Cliente não informado";
      map.set(key, [...(map.get(key) ?? []), call]);
    });
    return [...map.entries()]
      .map(([name, calls]) => ({ name, active: calls.length, pending: calls.filter((call) => call.status === "pendente").length }))
      .sort((a, b) => b.active - a.active)
      .slice(0, 8);
  }, [activeCalls]);

  if (!target) return null;

  return createPortal(
    <section className="service-sla-ops-section">
      <header className="service-sla-ops-heading">
        <div>
          <small>VISÃO OPERACIONAL</small>
          <h3>Fluxo e capacidade da operação</h3>
          <p>Indicadores operacionais integrados ao mesmo painel gerencial de SLA.</p>
        </div>
        <span>Sincronizado com o período selecionado acima</span>
      </header>

      <div className="service-sla-ops-kpis">
        <article><span>Backlog ativo</span><strong>{metrics.backlog}</strong><small>chamados ainda em andamento</small></article>
        <article className={metrics.pending ? "warning" : ""}><span>Pendências abertas</span><strong>{metrics.pending}</strong><small>aguardando desbloqueio</small></article>
        <article className={metrics.overdue ? "danger" : ""}><span>Agendamentos vencidos</span><strong>{metrics.overdue}</strong><small>atendimentos com horário ultrapassado</small></article>
        <article><span>Concluídos no período</span><strong>{metrics.completed}</strong><small>de acordo com o filtro acima</small></article>
        <article><span>Ciclo médio</span><strong>{formatDuration(metrics.avgCycle)}</strong><small>da abertura até a conclusão</small></article>
      </div>

      <section className="service-sla-ops-card service-sla-ops-trend">
        <header>
          <div><small>FLUXO</small><h4>Aberturas x Conclusões</h4></div>
          <div className="service-sla-ops-legend"><span><i className="opened" />Aberturas</span><span><i className="closed" />Conclusões</span></div>
        </header>
        <div className="service-sla-ops-chart-wrap">
          <svg className="service-sla-ops-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Gráfico de aberturas e conclusões">
            <line x1="0" y1="92" x2="100" y2="92" className="axis" />
            <line x1="0" y1="53" x2="100" y2="53" className="grid" />
            <line x1="0" y1="14" x2="100" y2="14" className="grid" />
            <polyline points={openedPoints} className="opened-line" />
            <polyline points={closedPoints} className="closed-line" />
          </svg>
          <div className="service-sla-ops-axis-labels">
            {trend.map((item, index) => {
              const every = Math.max(1, Math.ceil(trend.length / 8));
              return <span key={item.key}>{index % every === 0 || index === trend.length - 1 ? item.label : ""}</span>;
            })}
          </div>
        </div>
      </section>

      <div className="service-sla-ops-tables">
        <section className="service-sla-ops-card">
          <header><div><small>EQUIPE</small><h4>Carga por técnico</h4></div></header>
          <div className="service-sla-ops-table">
            <div className="head"><span>Técnico</span><span>Ativos</span><span>Pend.</span></div>
            {technicianRows.length ? technicianRows.map((item) => <div className="row" key={item.name}><strong>{item.name}</strong><span>{item.active}</span><span>{item.pending}</span></div>) : <p className="empty">Sem chamados ativos.</p>}
          </div>
        </section>
        <section className="service-sla-ops-card">
          <header><div><small>CLIENTES</small><h4>Carteira por cliente</h4></div></header>
          <div className="service-sla-ops-table">
            <div className="head"><span>Cliente</span><span>Ativos</span><span>Pend.</span></div>
            {clientRows.length ? clientRows.map((item) => <div className="row" key={item.name}><strong>{item.name}</strong><span>{item.active}</span><span>{item.pending}</span></div>) : <p className="empty">Sem chamados ativos.</p>}
          </div>
        </section>
      </div>
    </section>,
    target,
  );
}
