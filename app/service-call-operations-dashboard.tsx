"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type ServiceCall = {
  id: number;
  number: string;
  companyId: number | null;
  companyName: string;
  technician: string | null;
  serviceType: string;
  priority: string;
  status: string;
  scheduledAt: string | null;
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

type ServiceData = {
  calls: ServiceCall[];
  history: HistoryItem[];
  pendencies: Pendency[];
};

type SlaPolicy = {
  id: number;
  companyId: number | null;
  priority: string | null;
  serviceType: string | null;
  actionMinutes: number | null;
  attendanceMinutes: number | null;
  targetMinutes: number;
  pausePending: boolean;
  active: boolean;
};

type PolicyData = { policies: SlaPolicy[] };

type AppliedPolicy = {
  actionMinutes: number | null;
  attendanceMinutes: number | null;
  resolutionMinutes: number;
  pausePending: boolean;
};

type AttentionItem = {
  call: ServiceCall;
  severity: number;
  label: string;
  detail: string;
};

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

const priorityLabels: Record<string, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  normal: "Normal",
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

const fallbackResolutionMinutes: Record<string, number> = {
  critica: 240,
  alta: 480,
  media: 1440,
  normal: 1440,
  baixa: 2880,
};

function serviceViewVisible() {
  if (document.querySelector(".service-column, .service-call-card, .service-call-sheet")) return true;
  return Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3")).some((node) =>
    /chamados|ordens de servi[cç]o/i.test(node.textContent ?? ""),
  );
}

function findServiceHeaderActionTarget() {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) =>
    /novo chamado/i.test(item.textContent ?? ""),
  );
  return button?.parentElement ?? null;
}

function toMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function normalizePriority(value: string | null | undefined) {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (text.includes("crit") || text.includes("urgent")) return "critica";
  if (text.includes("alta") || text.includes("high")) return "alta";
  if (text.includes("baix") || text.includes("low")) return "baixa";
  return "normal";
}

function normalizeServiceType(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
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

function displayNumber(value: string) {
  return value.replace(/^OS-(?:\d{4}-)?/, "TDK-").replace(/^TDK-\d{4}-/, "TDK-");
}

function policySpecificity(policy: SlaPolicy) {
  const count = Number(policy.companyId !== null) + Number(Boolean(policy.priority)) + Number(Boolean(policy.serviceType));
  const tie = Number(policy.companyId !== null) * 4 + Number(Boolean(policy.serviceType)) * 2 + Number(Boolean(policy.priority));
  return count * 10 + tie;
}

function policyMatches(policy: SlaPolicy, call: ServiceCall) {
  if (!policy.active) return false;
  if (policy.companyId !== null && policy.companyId !== call.companyId) return false;
  if (policy.priority && normalizePriority(policy.priority) !== normalizePriority(call.priority)) return false;
  if (policy.serviceType && normalizeServiceType(policy.serviceType) !== normalizeServiceType(call.serviceType)) return false;
  return true;
}

function resolvePolicy(call: ServiceCall, policies: SlaPolicy[]): AppliedPolicy {
  const selected = policies
    .filter((policy) => policyMatches(policy, call))
    .sort((a, b) => policySpecificity(b) - policySpecificity(a) || b.id - a.id)[0];
  if (selected) {
    return {
      actionMinutes: selected.actionMinutes ?? null,
      attendanceMinutes: selected.attendanceMinutes ?? null,
      resolutionMinutes: selected.targetMinutes,
      pausePending: selected.pausePending,
    };
  }
  const priority = normalizePriority(call.priority);
  return {
    actionMinutes: null,
    attendanceMinutes: null,
    resolutionMinutes: fallbackResolutionMinutes[priority] ?? 1440,
    pausePending: true,
  };
}

function transitionAt(callId: number, history: HistoryItem[], status: string) {
  const event = history
    .filter((item) => item.serviceCallId === callId && item.toStatus === status)
    .sort((a, b) => (toMs(a.createdAt) ?? 0) - (toMs(b.createdAt) ?? 0))[0];
  return toMs(event?.createdAt);
}

function pendingUntil(callId: number, pendencies: Pendency[], end: number) {
  return pendencies
    .filter((item) => item.serviceCallId === callId)
    .reduce((total, item) => {
      const start = toMs(item.startedAt);
      if (start === null || start >= end) return total;
      const finish = Math.min(toMs(item.endedAt) ?? end, end);
      return total + Math.max(0, finish - start);
    }, 0);
}

function effectiveElapsed(call: ServiceCall, pendencies: Pendency[], end: number, pausePending: boolean) {
  const start = toMs(call.createdAt) ?? end;
  const raw = Math.max(0, end - start);
  return Math.max(0, raw - (pausePending ? pendingUntil(call.id, pendencies, end) : 0));
}

function monitoredStage(call: ServiceCall, history: HistoryItem[], pendencies: Pendency[], policy: AppliedPolicy, now: number) {
  const actionAt = transitionAt(call.id, history, "acionado");
  const attendanceAt = transitionAt(call.id, history, "atendimento");
  if (actionAt === null && policy.actionMinutes !== null) {
    return { label: "Acionamento", elapsed: effectiveElapsed(call, pendencies, now, policy.pausePending), target: policy.actionMinutes * 60000 };
  }
  if (attendanceAt === null && policy.attendanceMinutes !== null) {
    return { label: "Atendimento", elapsed: effectiveElapsed(call, pendencies, now, policy.pausePending), target: policy.attendanceMinutes * 60000 };
  }
  return { label: "Resolução", elapsed: effectiveElapsed(call, pendencies, now, policy.pausePending), target: policy.resolutionMinutes * 60000 };
}

function conclusionAt(callId: number, history: HistoryItem[]) {
  const events = history
    .filter((item) => item.serviceCallId === callId && item.toStatus === "concluido")
    .sort((a, b) => (toMs(a.createdAt) ?? 0) - (toMs(b.createdAt) ?? 0));
  return toMs(events.at(-1)?.createdAt);
}

function dayKey(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shortDay(ms: number) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(ms));
}

export function ServiceCallOperationsDashboard() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ServiceData>({ calls: [], history: [], pendencies: [] });
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [period, setPeriod] = useState<"7" | "30" | "90" | "all">("30");
  const [client, setClient] = useState("");
  const [technician, setTechnician] = useState("");
  const [priority, setPriority] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const apply = () => {
      setVisible(serviceViewVisible());
      setHeaderTarget(findServiceHeaderActionTarget());
    };
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
      const [serviceResponse, policyResponse] = await Promise.all([
        fetch("/api/service-calls", { cache: "no-store" }),
        fetch("/api/service-call-sla-policies", { cache: "no-store" }),
      ]);
      if (serviceResponse.ok) {
        const payload = (await serviceResponse.json()) as Partial<ServiceData>;
        setData({ calls: payload.calls ?? [], history: payload.history ?? [], pendencies: payload.pendencies ?? [] });
      }
      if (policyResponse.ok) {
        const payload = (await policyResponse.json()) as Partial<PolicyData>;
        setPolicies(payload.policies ?? []);
      }
      setNow(Date.now());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  const clientOptions = useMemo(() => [...new Set(data.calls.map((call) => call.companyName?.trim()).filter(Boolean))].sort(), [data.calls]);
  const technicianOptions = useMemo(() => [...new Set(data.calls.map((call) => call.technician?.trim()).filter(Boolean) as string[])].sort(), [data.calls]);

  const filteredCalls = useMemo(
    () => data.calls.filter((call) => {
      if (client && call.companyName !== client) return false;
      if (technician && (call.technician?.trim() || "") !== technician) return false;
      if (priority && normalizePriority(call.priority) !== priority) return false;
      return true;
    }),
    [data.calls, client, technician, priority],
  );

  const filteredIds = useMemo(() => new Set(filteredCalls.map((call) => call.id)), [filteredCalls]);
  const activeCalls = useMemo(() => filteredCalls.filter((call) => call.status !== "concluido" && call.status !== "cancelado"), [filteredCalls]);
  const cutoff = period === "all" ? 0 : now - Number(period) * 86400000;

  const metrics = useMemo(() => {
    const risk = activeCalls.map((call) => {
      const stage = monitoredStage(call, data.history, data.pendencies, resolvePolicy(call, policies), now);
      return { call, stage, ratio: stage.elapsed / Math.max(1, stage.target) };
    });
    const openPendencies = data.pendencies.filter((item) => !item.endedAt && filteredIds.has(item.serviceCallId));
    const overdueSchedule = activeCalls.filter((call) => {
      const scheduled = toMs(call.scheduledAt);
      return scheduled !== null && scheduled < now && transitionAt(call.id, data.history, "atendimento") === null;
    });
    const completed = filteredCalls.filter((call) => {
      const concluded = conclusionAt(call.id, data.history);
      return concluded !== null && concluded >= cutoff;
    });
    const cycles = completed.map((call) => {
      const concluded = conclusionAt(call.id, data.history);
      if (concluded === null) return null;
      const policy = resolvePolicy(call, policies);
      return effectiveElapsed(call, data.pendencies, concluded, policy.pausePending);
    }).filter((value): value is number => value !== null);
    return {
      backlog: activeCalls.length,
      risk: risk.filter((item) => item.ratio >= 0.8 && item.ratio < 1).length,
      breached: risk.filter((item) => item.ratio >= 1).length,
      pending: openPendencies.length,
      overdueSchedule: overdueSchedule.length,
      completed: completed.length,
      avgCycle: cycles.length ? cycles.reduce((sum, value) => sum + value, 0) / cycles.length : null,
      oldest: activeCalls.reduce((max, call) => Math.max(max, now - (toMs(call.createdAt) ?? now)), 0),
    };
  }, [activeCalls, data.history, data.pendencies, filteredCalls, filteredIds, policies, now, cutoff]);

  const aging = useMemo(() => {
    const values = [
      { label: "Até 24h", count: 0 },
      { label: "1–3 dias", count: 0 },
      { label: "3–7 dias", count: 0 },
      { label: "Mais de 7 dias", count: 0 },
    ];
    activeCalls.forEach((call) => {
      const age = now - (toMs(call.createdAt) ?? now);
      if (age < 86400000) values[0].count += 1;
      else if (age < 3 * 86400000) values[1].count += 1;
      else if (age < 7 * 86400000) values[2].count += 1;
      else values[3].count += 1;
    });
    return values;
  }, [activeCalls, now]);

  const statusDistribution = useMemo(() => {
    const map = new Map<string, number>();
    activeCalls.forEach((call) => map.set(call.status, (map.get(call.status) ?? 0) + 1));
    return [...map.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
  }, [activeCalls]);

  const attention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    activeCalls.forEach((call) => {
      const stage = monitoredStage(call, data.history, data.pendencies, resolvePolicy(call, policies), now);
      const ratio = stage.elapsed / Math.max(1, stage.target);
      const scheduled = toMs(call.scheduledAt);
      const pending = [...data.pendencies].reverse().find((item) => item.serviceCallId === call.id && !item.endedAt);
      if (ratio >= 1) {
        items.push({ call, severity: 500 + ratio, label: `SLA de ${stage.label} estourado`, detail: `${formatDuration(stage.elapsed)} consumidos de ${formatDuration(stage.target)}` });
        return;
      }
      if (ratio >= 0.8) {
        items.push({ call, severity: 400 + ratio, label: `SLA de ${stage.label} em risco`, detail: `${Math.round(ratio * 100)}% do limite consumido` });
        return;
      }
      if (scheduled !== null && scheduled < now && transitionAt(call.id, data.history, "atendimento") === null) {
        items.push({ call, severity: 300 + (now - scheduled) / 86400000, label: "Agendamento vencido", detail: `Atraso de ${formatDuration(now - scheduled)}` });
        return;
      }
      if (pending) {
        const start = toMs(pending.startedAt) ?? now;
        items.push({ call, severity: 200 + (now - start) / 86400000, label: pendingReasonLabels[pending.reason] ?? "Pendência aberta", detail: `Pendente há ${formatDuration(now - start)}` });
        return;
      }
      const age = now - (toMs(call.createdAt) ?? now);
      if (age >= 7 * 86400000) items.push({ call, severity: 100 + age / 86400000, label: "Backlog envelhecido", detail: `Aberto há ${formatDuration(age)}` });
    });
    return items.sort((a, b) => b.severity - a.severity).slice(0, 12);
  }, [activeCalls, data.history, data.pendencies, policies, now]);

  const technicianWorkload = useMemo(() => {
    const map = new Map<string, ServiceCall[]>();
    activeCalls.forEach((call) => {
      const key = call.technician?.trim() || "Não atribuído";
      map.set(key, [...(map.get(key) ?? []), call]);
    });
    return [...map.entries()].map(([name, calls]) => ({
      name,
      total: calls.length,
      pending: calls.filter((call) => call.status === "pendente").length,
      attention: calls.filter((call) => {
        const stage = monitoredStage(call, data.history, data.pendencies, resolvePolicy(call, policies), now);
        return stage.elapsed / Math.max(1, stage.target) >= 0.8;
      }).length,
    })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [activeCalls, data.history, data.pendencies, policies, now]);

  const clientWorkload = useMemo(() => {
    const map = new Map<string, ServiceCall[]>();
    activeCalls.forEach((call) => {
      const key = call.companyName?.trim() || "Cliente não informado";
      map.set(key, [...(map.get(key) ?? []), call]);
    });
    return [...map.entries()].map(([name, calls]) => ({
      name,
      total: calls.length,
      pending: calls.filter((call) => call.status === "pendente").length,
      old: calls.filter((call) => now - (toMs(call.createdAt) ?? now) >= 3 * 86400000).length,
    })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [activeCalls, now]);

  const trend = useMemo(() => {
    const days = period === "7" ? 7 : period === "90" ? 30 : period === "all" ? 30 : 14;
    const rows = Array.from({ length: days }, (_, index) => {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (days - 1 - index));
      const ms = start.getTime();
      return { key: dayKey(ms), label: shortDay(ms), opened: 0, closed: 0 };
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));
    filteredCalls.forEach((call) => {
      const created = toMs(call.createdAt);
      if (created !== null) {
        const row = byKey.get(dayKey(created));
        if (row) row.opened += 1;
      }
      const concluded = conclusionAt(call.id, data.history);
      if (concluded !== null) {
        const row = byKey.get(dayKey(concluded));
        if (row) row.closed += 1;
      }
    });
    return rows;
  }, [filteredCalls, data.history, now, period]);

  const trendMax = Math.max(1, ...trend.flatMap((row) => [row.opened, row.closed]));

  if (!visible) return null;

  const trigger = (
    <button className="service-ops-trigger" type="button" onClick={() => setOpen(true)}>
      <span>OPERAÇÃO</span>
      <strong>Painel gerencial</strong>
    </button>
  );

  return (
    <>
      {headerTarget ? createPortal(trigger, headerTarget) : trigger}
      {open ? (
        <div className="service-ops-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="service-ops-dashboard" role="dialog" aria-modal="true" aria-label="Painel operacional gerencial">
            <header className="service-ops-header">
              <div><small>CHAMADOS E ORDENS DE SERVIÇO</small><h2>Painel operacional gerencial</h2><p>Backlog, risco, produtividade, agendamento e fluxo de atendimento em uma visão executiva.</p></div>
              <div className="service-ops-header-actions"><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button><button className="service-ops-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button></div>
            </header>

            <div className="service-ops-filters">
              <label><span>Período</span><select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="all">Histórico</option></select></label>
              <label><span>Cliente</span><select value={client} onChange={(event) => setClient(event.target.value)}><option value="">Todos</option>{clientOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label><span>Técnico</span><select value={technician} onChange={(event) => setTechnician(event.target.value)}><option value="">Todos</option>{technicianOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label><span>Prioridade</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Todas</option><option value="critica">Crítica</option><option value="alta">Alta</option><option value="normal">Normal</option><option value="baixa">Baixa</option></select></label>
              <button type="button" className="service-ops-clear" onClick={() => { setClient(""); setTechnician(""); setPriority(""); }}>Limpar filtros</button>
            </div>

            <div className="service-ops-kpis">
              <article><span>Backlog ativo</span><strong>{metrics.backlog}</strong><small>mais antigo: {formatDuration(metrics.oldest)}</small></article>
              <article className={metrics.risk ? "warning" : ""}><span>SLA em risco</span><strong>{metrics.risk}</strong><small>entre 80% e 99% do limite</small></article>
              <article className={metrics.breached ? "danger" : ""}><span>SLA estourado</span><strong>{metrics.breached}</strong><small>ação gerencial necessária</small></article>
              <article className={metrics.pending ? "pending" : ""}><span>Pendências abertas</span><strong>{metrics.pending}</strong><small>aguardando desbloqueio</small></article>
              <article className={metrics.overdueSchedule ? "danger" : ""}><span>Agendamento vencido</span><strong>{metrics.overdueSchedule}</strong><small>sem início de atendimento</small></article>
              <article><span>Concluídos no período</span><strong>{metrics.completed}</strong><small>ciclo médio: {formatDuration(metrics.avgCycle)}</small></article>
            </div>

            <div className="service-ops-grid service-ops-grid-top">
              <section className="service-ops-card"><header><div><small>IDADE DO BACKLOG</small><h3>Envelhecimento dos chamados</h3></div></header><div className="service-ops-bars">{aging.map((item) => <div key={item.label}><span>{item.label}</span><div><i style={{ width: `${metrics.backlog ? Math.max(4, item.count / metrics.backlog * 100) : 0}%` }} /></div><strong>{item.count}</strong></div>)}</div></section>
              <section className="service-ops-card"><header><div><small>CARTEIRA ATUAL</small><h3>Distribuição por status</h3></div></header><div className="service-ops-status-list">{statusDistribution.length ? statusDistribution.map((item) => <div key={item.status}><span>{statusLabels[item.status] ?? item.status}</span><strong>{item.count}</strong></div>) : <p className="empty">Nenhum chamado ativo.</p>}</div></section>
            </div>

            <section className="service-ops-card service-ops-attention"><header><div><small>PRIORIDADES GERENCIAIS</small><h3>Fila de atenção</h3></div><strong>{attention.length} item(ns) prioritário(s)</strong></header><div className="service-ops-attention-table"><div className="head"><span>OS</span><span>Cliente</span><span>Técnico</span><span>Prioridade</span><span>Motivo</span><span>Detalhe</span></div>{attention.length ? attention.map((item) => <div className="row" key={item.call.id}><strong>{displayNumber(item.call.number)}</strong><span>{item.call.companyName || "Não informado"}</span><span>{item.call.technician || "Não atribuído"}</span><span>{priorityLabels[normalizePriority(item.call.priority)] ?? item.call.priority}</span><span>{item.label}</span><span>{item.detail}</span></div>) : <p className="empty">Nenhuma ocorrência crítica com os filtros atuais.</p>}</div></section>

            <section className="service-ops-card service-ops-trend"><header><div><small>FLUXO</small><h3>Aberturas x conclusões</h3></div><div className="service-ops-legend"><span><i className="opened" />Abertos</span><span><i className="closed" />Concluídos</span></div></header><div className="service-ops-chart">{trend.map((row, index) => <div className="service-ops-chart-day" key={row.key} title={`${row.label}: ${row.opened} aberto(s), ${row.closed} concluído(s)`}><div className="bars"><i className="opened" style={{ height: `${Math.max(row.opened ? 5 : 0, row.opened / trendMax * 100)}%` }} /><i className="closed" style={{ height: `${Math.max(row.closed ? 5 : 0, row.closed / trendMax * 100)}%` }} /></div><small>{index % Math.max(1, Math.ceil(trend.length / 8)) === 0 || index === trend.length - 1 ? row.label : ""}</small></div>)}</div></section>

            <div className="service-ops-grid">
              <section className="service-ops-card"><header><div><small>EQUIPE</small><h3>Carga por técnico</h3></div></header><div className="service-ops-table"><div className="head"><span>Técnico</span><span>Ativos</span><span>Pend.</span><span>Atenção</span></div>{technicianWorkload.length ? technicianWorkload.map((item) => <div className="row" key={item.name}><strong>{item.name}</strong><span>{item.total}</span><span>{item.pending}</span><span className={item.attention ? "bad" : "good"}>{item.attention}</span></div>) : <p className="empty">Sem dados.</p>}</div></section>
              <section className="service-ops-card"><header><div><small>CLIENTES</small><h3>Carteira por cliente</h3></div></header><div className="service-ops-table"><div className="head"><span>Cliente</span><span>Ativos</span><span>Pend.</span><span>&gt; 3 dias</span></div>{clientWorkload.length ? clientWorkload.map((item) => <div className="row" key={item.name}><strong>{item.name}</strong><span>{item.total}</span><span>{item.pending}</span><span className={item.old ? "bad" : "good"}>{item.old}</span></div>) : <p className="empty">Sem dados.</p>}</div></section>
            </div>

            <footer className="service-ops-footer"><span>Backlog considera todos os chamados ativos, independentemente do período selecionado.</span><span>O período controla conclusões e tendência; filtros de cliente, técnico e prioridade afetam toda a visão.</span></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
