"use client";

import { useEffect, useMemo, useState } from "react";

type ServiceCall = {
  id: number;
  number: string;
  companyName: string;
  technician: string | null;
  priority: string;
  status: string;
  createdAt: string;
};

type HistoryItem = {
  id: number;
  serviceCallId: number;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string;
  createdAt: string;
};

type Pendency = {
  id: number;
  serviceCallId: number;
  reason: string;
  notes: string | null;
  startedAt: string;
  endedAt: string | null;
};

type ApiData = {
  calls: ServiceCall[];
  history: HistoryItem[];
  pendencies: Pendency[];
};

type SlaPolicy = Record<"critica" | "alta" | "media" | "baixa", number>;

type ComputedCall = ServiceCall & {
  elapsedMs: number;
  pendingMs: number;
  effectiveMs: number;
  targetMs: number;
  withinSla: boolean;
  isTerminal: boolean;
  firstActionMs: number | null;
  firstAttendanceMs: number | null;
};

const STORAGE_KEY = "tdk-manager-service-sla-policy-v1";
const STORAGE_PAUSE_KEY = "tdk-manager-service-sla-pause-pending-v1";

const defaultPolicy: SlaPolicy = {
  critica: 4,
  alta: 8,
  media: 24,
  baixa: 48,
};

const priorityLabels: Record<keyof SlaPolicy, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

const pendingReasonLabels: Record<string, string> = {
  aguardando_cliente: "Aguardando cliente",
  aguardando_peca_material: "Peça / material",
  aguardando_acesso: "Aguardando acesso",
  aguardando_aprovacao: "Aguardando aprovação",
  reagendamento: "Reagendamento",
  terceiros: "Terceiros",
  outros: "Outros",
};

function toMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function normalizePriority(value: string): keyof SlaPolicy {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (normalized.includes("crit") || normalized.includes("urgent")) return "critica";
  if (normalized.includes("alta") || normalized.includes("high")) return "alta";
  if (normalized.includes("baix") || normalized.includes("low")) return "baixa";
  return "media";
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

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function average(values: Array<number | null>) {
  const valid = values.filter((item): item is number => item !== null && Number.isFinite(item));
  return valid.length ? valid.reduce((sum, item) => sum + item, 0) / valid.length : null;
}

function serviceViewVisible() {
  if (document.querySelector(".service-column, .service-call-card, .service-call-sheet")) return true;
  return Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3")).some((node) =>
    /chamados|ordens de servi[cç]o/i.test(node.textContent ?? ""),
  );
}

function callEnd(call: ServiceCall, history: HistoryItem[], now: number) {
  if (call.status !== "concluido" && call.status !== "cancelado") return now;
  const finalEvent = history
    .filter(
      (item) =>
        item.serviceCallId === call.id &&
        (item.toStatus === "concluido" || item.toStatus === "cancelado"),
    )
    .sort((a, b) => (toMs(a.createdAt) ?? 0) - (toMs(b.createdAt) ?? 0))
    .at(-1);
  return toMs(finalEvent?.createdAt) ?? now;
}

function pendingTime(callId: number, pendencies: Pendency[], end: number) {
  return pendencies
    .filter((item) => item.serviceCallId === callId)
    .reduce((total, item) => {
      const start = toMs(item.startedAt);
      if (start === null) return total;
      const finish = Math.min(toMs(item.endedAt) ?? end, end);
      return total + Math.max(0, finish - start);
    }, 0);
}

function firstTransitionTime(
  call: ServiceCall,
  history: HistoryItem[],
  targets: string[],
) {
  const created = toMs(call.createdAt);
  if (created === null) return null;
  const item = history
    .filter((entry) => entry.serviceCallId === call.id && targets.includes(entry.toStatus))
    .sort((a, b) => (toMs(a.createdAt) ?? 0) - (toMs(b.createdAt) ?? 0))[0];
  const reached = toMs(item?.createdAt);
  return reached === null ? null : Math.max(0, reached - created);
}

export function ServiceCallSlaDashboard() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiData>({ calls: [], history: [], pendencies: [] });
  const [period, setPeriod] = useState<"7" | "30" | "90" | "all">("30");
  const [policy, setPolicy] = useState<SlaPolicy>(defaultPolicy);
  const [pausePending, setPausePending] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setPolicy({ ...defaultPolicy, ...(JSON.parse(stored) as Partial<SlaPolicy>) });
      const storedPause = window.localStorage.getItem(STORAGE_PAUSE_KEY);
      if (storedPause !== null) setPausePending(storedPause === "true");
    } catch {
      // Mantém os parâmetros padrão caso o armazenamento local não esteja disponível.
    }
  }, []);

  useEffect(() => {
    const apply = () => setVisible(serviceViewVisible());
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/service-calls", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as Partial<ApiData>;
      setData({
        calls: payload.calls ?? [],
        history: payload.history ?? [],
        pendencies: payload.pendencies ?? [],
      });
      setNow(Date.now());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  function updatePolicy(key: keyof SlaPolicy, hours: number) {
    const next = { ...policy, [key]: Math.max(0.5, hours || 0.5) };
    setPolicy(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function updatePausePending(value: boolean) {
    setPausePending(value);
    try {
      window.localStorage.setItem(STORAGE_PAUSE_KEY, String(value));
    } catch {}
  }

  const computed = useMemo(() => {
    const cutoff =
      period === "all" ? 0 : now - Number(period) * 24 * 60 * 60 * 1000;
    return data.calls
      .filter((call) => (toMs(call.createdAt) ?? 0) >= cutoff)
      .map<ComputedCall>((call) => {
        const start = toMs(call.createdAt) ?? now;
        const end = callEnd(call, data.history, now);
        const elapsedMs = Math.max(0, end - start);
        const pendingMs = pendingTime(call.id, data.pendencies, end);
        const effectiveMs = Math.max(0, elapsedMs - (pausePending ? pendingMs : 0));
        const priority = normalizePriority(call.priority);
        const targetMs = policy[priority] * 60 * 60 * 1000;
        return {
          ...call,
          elapsedMs,
          pendingMs,
          effectiveMs,
          targetMs,
          withinSla: effectiveMs <= targetMs,
          isTerminal: call.status === "concluido" || call.status === "cancelado",
          firstActionMs: firstTransitionTime(call, data.history, ["acionado"]),
          firstAttendanceMs: firstTransitionTime(call, data.history, ["atendimento"]),
        };
      });
  }, [data, period, policy, pausePending, now]);

  const metrics = useMemo(() => {
    const eligible = computed.filter((call) => call.status !== "cancelado");
    const concluded = eligible.filter((call) => call.status === "concluido");
    const active = eligible.filter((call) => !call.isTerminal);
    const outside = eligible.filter((call) => !call.withinSla);
    const within = eligible.length - outside.length;
    return {
      total: eligible.length,
      active: active.length,
      concluded: concluded.length,
      outside: outside.length,
      compliance: eligible.length ? (within / eligible.length) * 100 : 0,
      avgAction: average(eligible.map((call) => call.firstActionMs)),
      avgAttendance: average(eligible.map((call) => call.firstAttendanceMs)),
      avgResolution: average(concluded.map((call) => call.effectiveMs)),
      avgPending: average(eligible.map((call) => call.pendingMs)),
      pendingTotal: eligible.reduce((sum, call) => sum + call.pendingMs, 0),
    };
  }, [computed]);

  const technicianRanking = useMemo(() => {
    const map = new Map<string, ComputedCall[]>();
    computed
      .filter((call) => call.status !== "cancelado")
      .forEach((call) => {
        const key = call.technician?.trim() || "Não atribuído";
        map.set(key, [...(map.get(key) ?? []), call]);
      });
    return [...map.entries()]
      .map(([name, calls]) => ({
        name,
        calls: calls.length,
        compliance: calls.length
          ? (calls.filter((call) => call.withinSla).length / calls.length) * 100
          : 0,
        avg: average(calls.map((call) => call.effectiveMs)),
      }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 8);
  }, [computed]);

  const clientRanking = useMemo(() => {
    const map = new Map<string, ComputedCall[]>();
    computed
      .filter((call) => call.status !== "cancelado")
      .forEach((call) => {
        const key = call.companyName?.trim() || "Cliente não informado";
        map.set(key, [...(map.get(key) ?? []), call]);
      });
    return [...map.entries()]
      .map(([name, calls]) => ({
        name,
        calls: calls.length,
        outside: calls.filter((call) => !call.withinSla).length,
        compliance: calls.length
          ? (calls.filter((call) => call.withinSla).length / calls.length) * 100
          : 0,
      }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 8);
  }, [computed]);

  const pendingBreakdown = useMemo(() => {
    const ids = new Set(computed.map((call) => call.id));
    const map = new Map<string, number>();
    data.pendencies
      .filter((item) => ids.has(item.serviceCallId))
      .forEach((item) => map.set(item.reason, (map.get(item.reason) ?? 0) + 1));
    return [...map.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }, [computed, data.pendencies]);

  if (!visible) return null;

  return (
    <>
      <button className="service-sla-trigger" type="button" onClick={() => setOpen(true)}>
        <span>SLA</span>
        <strong>Painel gerencial</strong>
      </button>

      {open ? (
        <div className="service-sla-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="service-sla-dashboard" role="dialog" aria-modal="true" aria-label="Painel gerencial de SLA dos chamados">
            <header className="service-sla-header">
              <div>
                <small>CHAMADOS E ORDENS DE SERVIÇO</small>
                <h2>Painel gerencial de SLA</h2>
                <p>Desempenho operacional, cumprimento dos prazos e impacto das pendências.</p>
              </div>
              <div className="service-sla-header-actions">
                <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
                <button className="service-sla-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
              </div>
            </header>

            <div className="service-sla-controls">
              <label>
                <span>Período</span>
                <select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}>
                  <option value="7">Últimos 7 dias</option>
                  <option value="30">Últimos 30 dias</option>
                  <option value="90">Últimos 90 dias</option>
                  <option value="all">Todo o histórico</option>
                </select>
              </label>
              <label className="service-sla-switch">
                <input type="checkbox" checked={pausePending} onChange={(event) => updatePausePending(event.target.checked)} />
                <span>Descontar tempo em pendência do SLA</span>
              </label>
              <div className="service-sla-policy-note">Parâmetros de referência editáveis por prioridade</div>
            </div>

            <div className="service-sla-policy">
              {(Object.keys(priorityLabels) as Array<keyof SlaPolicy>).map((key) => (
                <label key={key}>
                  <span>{priorityLabels[key]}</span>
                  <div><input type="number" min="0.5" step="0.5" value={policy[key]} onChange={(event) => updatePolicy(key, Number(event.target.value))} /><em>horas</em></div>
                </label>
              ))}
            </div>

            <div className="service-sla-kpis">
              <article><span>Cumprimento do SLA</span><strong>{percent(metrics.compliance)}</strong><small>{metrics.outside} fora do prazo · {metrics.total} avaliados</small></article>
              <article><span>Tempo até acionamento</span><strong>{formatDuration(metrics.avgAction)}</strong><small>Média desde a abertura</small></article>
              <article><span>Tempo até atendimento</span><strong>{formatDuration(metrics.avgAttendance)}</strong><small>Média até iniciar execução</small></article>
              <article><span>Tempo de resolução</span><strong>{formatDuration(metrics.avgResolution)}</strong><small>Média efetiva dos concluídos</small></article>
              <article className="pending"><span>Tempo médio pendente</span><strong>{formatDuration(metrics.avgPending)}</strong><small>{formatDuration(metrics.pendingTotal)} acumulado</small></article>
              <article><span>Carteira operacional</span><strong>{metrics.active}</strong><small>{metrics.concluded} concluídos no período</small></article>
            </div>

            <div className="service-sla-grid">
              <section className="service-sla-card">
                <header><div><small>PRODUTIVIDADE</small><h3>Desempenho por técnico</h3></div></header>
                <div className="service-sla-table">
                  <div className="head"><span>Técnico</span><span>OS</span><span>SLA</span><span>Tempo médio</span></div>
                  {technicianRanking.length ? technicianRanking.map((item) => (
                    <div className="row" key={item.name}><strong>{item.name}</strong><span>{item.calls}</span><span className={item.compliance >= 90 ? "good" : item.compliance < 75 ? "bad" : ""}>{percent(item.compliance)}</span><span>{formatDuration(item.avg)}</span></div>
                  )) : <p className="empty">Sem dados no período selecionado.</p>}
                </div>
              </section>

              <section className="service-sla-card">
                <header><div><small>CLIENTES</small><h3>Volume e cumprimento por cliente</h3></div></header>
                <div className="service-sla-table">
                  <div className="head"><span>Cliente</span><span>OS</span><span>Fora</span><span>SLA</span></div>
                  {clientRanking.length ? clientRanking.map((item) => (
                    <div className="row" key={item.name}><strong>{item.name}</strong><span>{item.calls}</span><span>{item.outside}</span><span className={item.compliance >= 90 ? "good" : item.compliance < 75 ? "bad" : ""}>{percent(item.compliance)}</span></div>
                  )) : <p className="empty">Sem dados no período selecionado.</p>}
                </div>
              </section>

              <section className="service-sla-card service-sla-pending-card">
                <header><div><small>GARGALOS</small><h3>Motivos de pendência</h3></div><strong>{pendingBreakdown.reduce((sum, item) => sum + item.count, 0)} ocorrências</strong></header>
                <div className="service-sla-pending-bars">
                  {pendingBreakdown.length ? pendingBreakdown.map((item) => {
                    const max = pendingBreakdown[0]?.count || 1;
                    return <div key={item.reason}><span>{pendingReasonLabels[item.reason] ?? item.reason}</span><div><i style={{ width: `${Math.max(5, (item.count / max) * 100)}%` }} /></div><strong>{item.count}</strong></div>;
                  }) : <p className="empty">Nenhuma pendência registrada no período.</p>}
                </div>
              </section>
            </div>

            <footer className="service-sla-footer">
              <span>Cancelados não entram no cálculo de cumprimento.</span>
              <span>{pausePending ? "O relógio do SLA é pausado durante pendências." : "Pendências continuam contando no relógio do SLA."}</span>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
