"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Priority = "critical" | "high" | "medium";

type AlertItem = {
  kind: "alert";
  id: number;
  title: string;
  detail: string;
  recommendedAction: string;
  accountName: string;
  priority: Priority;
  amount: number;
  alertType: "negative_forecast" | "critical_task" | "reconciliation" | "closing_overdue";
  alertTypeLabel: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  firstSeenAt: string;
  assignedAt: string | null;
  assignmentSource: string | null;
  escalationStage: "ack_overdue" | "resolution_overdue" | null;
  slaDueAt: string | null;
  slaRemainingMinutes: number | null;
  dueSoon: boolean;
  destination: string;
};

type PreventiveItem = {
  kind: "preventive";
  id: number;
  title: string;
  detail: string;
  recommendedAction: string;
  accountName: string;
  priority: Priority;
  amount: 0;
  alertType: string;
  alertTypeLabel: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  firstSeenAt: string;
  assignedAt: string | null;
  assignmentSource: string | null;
  preparationEscalatedAt: string | null;
  preparationDueAt: string | null;
  preparedAt: string | null;
  preparedBy: string | null;
  preparationNote: string | null;
  riskDate: string;
  daysUntilRisk: number;
  slaRemainingMinutes: number | null;
  dueSoon: boolean;
  destination: "capacity_alerts";
};

type TaskItem = {
  kind: "task";
  id: number;
  title: string;
  detail: string;
  recommendedAction: string;
  accountName: string;
  bankName: string | null;
  priority: Priority;
  amount: number;
  status: "open" | "in_progress" | "waiting";
  issueType: string;
  firstSeenDate: string;
  assignedName: string | null;
  assignedEmail: string | null;
  destination: "reconciliation" | "ledger" | "closing" | "tasks";
  escalationStage: null;
  slaRemainingMinutes: null;
  dueSoon: false;
};

type WorkItem = AlertItem | PreventiveItem | TaskItem;
type Filter = "all" | "urgent" | "alerts" | "preventives" | "tasks" | "waiting";

type Payload = {
  generatedAt: string;
  currentUser: { email: string };
  items: WorkItem[];
  summary: {
    total: number;
    alerts: number;
    preventives: number;
    tasks: number;
    critical: number;
    escalated: number;
    dueSoon: number;
    unacknowledged: number;
    preventivePrepared: number;
    inProgress: number;
    waiting: number;
    affectedAmount: number;
  };
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const shortDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const priorityLabel: Record<Priority, string> = { critical: "Crítica", high: "Alta", medium: "Média" };
const statusLabel = { open: "Aberta", in_progress: "Em andamento", waiting: "Aguardando" } as const;

function minutesLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const absolute = Math.abs(Math.round(value));
  if (absolute < 60) return `${absolute} min`;
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  if (hours < 48) return rest ? `${hours}h ${rest}min` : `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function slaText(item: AlertItem) {
  if (item.escalationStage === "ack_overdue") return `SLA de ciência vencido há ${minutesLabel(item.slaRemainingMinutes)}`;
  if (item.escalationStage === "resolution_overdue") return `SLA operacional vencido há ${minutesLabel(item.slaRemainingMinutes)}`;
  if (item.slaRemainingMinutes === null) return "Sem prazo calculado";
  return item.acknowledgedAt ? `Normalização em até ${minutesLabel(item.slaRemainingMinutes)}` : `Ciência em até ${minutesLabel(item.slaRemainingMinutes)}`;
}

function preventiveSlaText(item: PreventiveItem) {
  if (item.preparedAt) return `Preparado em ${dateTime(item.preparedAt)}`;
  if (item.preparationEscalatedAt) return `SLA de preparação vencido há ${minutesLabel(item.slaRemainingMinutes)}`;
  if (item.slaRemainingMinutes === null) return "Sem prazo calculado";
  return `Preparar em até ${minutesLabel(item.slaRemainingMinutes)}`;
}

export function TreasuryMyWorkDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const locate = () => setTarget(document.querySelector<HTMLElement>(".receivable-metrics"));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/treasury-my-work", { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) {
        if (!silent) setMessage(result.error ?? "Não foi possível carregar seu trabalho da Tesouraria.");
        return;
      }
      setPayload(result);
      setAuthorized(true);
      setMessage("");
    } catch {
      if (!silent) setMessage("Não foi possível carregar seu trabalho da Tesouraria.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { if (target && authorized === null) void refresh(true); }, [target, authorized]);
  useEffect(() => {
    if (!target || authorized === false) return;
    const timer = window.setInterval(() => void refresh(true), 60000);
    return () => window.clearInterval(timer);
  }, [target, authorized]);
  useEffect(() => { if (open) void refresh(); }, [open]);

  const visibleItems = useMemo(() => (payload?.items ?? []).filter((item) => {
    if (filter === "all") return true;
    if (filter === "alerts") return item.kind === "alert";
    if (filter === "preventives") return item.kind === "preventive";
    if (filter === "tasks") return item.kind === "task";
    if (filter === "waiting") return item.kind === "task" && item.status === "waiting";
    if (item.priority === "critical") return true;
    if (item.kind === "alert") return Boolean(item.escalationStage) || item.dueSoon;
    if (item.kind === "preventive") return Boolean(item.preparationEscalatedAt && !item.preparedAt) || item.dueSoon;
    return false;
  }), [payload, filter]);

  async function acknowledge(item: AlertItem | PreventiveItem) {
    const note = window.prompt(`Observação opcional ao reconhecer “${item.title}”:`, "");
    if (note === null) return;
    const endpoint = item.kind === "preventive" ? "/api/treasury-capacity-alerts" : "/api/treasury-executive-alerts";
    setSavingId(`${item.kind}-ack-${item.id}`);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge", occurrenceId: item.id, note: note.trim() }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível registrar a ciência.");
        return;
      }
      setMessage(item.kind === "preventive" ? "Ciência registrada. O SLA de preparação continua até a ação ser marcada como preparada." : "Ciência registrada. O alerta continua ativo até a causa ser normalizada.");
      await refresh(true);
    } finally {
      setSavingId(null);
    }
  }

  async function prepare(item: PreventiveItem) {
    const note = window.prompt(`O que foi preparado para “${item.title}”?`, item.preparationNote ?? "");
    if (note === null) return;
    setSavingId(`preventive-prepare-${item.id}`);
    try {
      const response = await fetch("/api/treasury-capacity-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare", occurrenceId: item.id, note: note.trim() }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível registrar a preparação.");
        return;
      }
      setMessage("Preparação preventiva registrada. O risco continuará monitorado até a condição desaparecer.");
      await refresh(true);
    } finally {
      setSavingId(null);
    }
  }

  async function updateTask(item: TaskItem, status: "open" | "in_progress" | "waiting") {
    setSavingId(`task-${item.id}`);
    try {
      const response = await fetch("/api/treasury-closing-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", id: item.id, status }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível atualizar a pendência.");
        return;
      }
      setMessage(status === "in_progress" ? "Pendência marcada como em andamento." : status === "waiting" ? "Pendência marcada como aguardando." : "Pendência devolvida para aberta.");
      await refresh(true);
    } finally {
      setSavingId(null);
    }
  }

  function openSource(item: WorkItem) {
    setOpen(false);
    let selector = ".treasury-tasks-trigger";
    if (item.kind === "preventive") selector = ".treasury-capacity-alerts-trigger";
    else if (item.kind === "alert") {
      selector = item.alertType === "negative_forecast" ? ".treasury-trigger" : item.alertType === "critical_task" ? ".treasury-tasks-trigger" : item.alertType === "reconciliation" ? ".recon-trigger" : ".treasury-calendar-trigger";
    } else {
      selector = item.destination === "reconciliation" ? ".recon-trigger" : item.destination === "ledger" ? ".ledger-trigger" : item.destination === "closing" ? ".treasury-closing-trigger" : ".treasury-tasks-trigger";
    }
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(selector)?.click(), 0);
  }

  if (!target || authorized === false) return null;
  const summary = payload?.summary;
  const urgent = Boolean(summary?.escalated || summary?.critical || summary?.dueSoon);

  return <>
    {createPortal(
      <button type="button" className={`treasury-my-work-trigger ${urgent ? "urgent" : "clear"}`} onClick={() => setOpen(true)} disabled={authorized === null}>
        <span>MEU TRABALHO</span>
        <strong>{summary?.total ?? "—"}</strong>
        <small>{summary?.escalated ? `${summary.escalated} escalonado(s)` : summary?.dueSoon ? `${summary.dueSoon} próximo(s) do SLA` : summary?.total ? "itens sob sua responsabilidade" : "sem pendências atribuídas"}</small>
      </button>,
      target,
    )}

    {open ? <div className="treasury-my-work-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-my-work-dashboard" role="dialog" aria-modal="true" aria-label="Meu trabalho da Tesouraria">
        <header className="treasury-my-work-header">
          <div><small>FINANCEIRO · MINHA FILA</small><h2>Meus alertas, preventivos e pendências</h2><p>Fila individual da Tesouraria. Alertas operacionais e riscos preventivos permanecem identificados separadamente; escalonamentos e prazos mais próximos aparecem primeiro.</p></div>
          <div className="treasury-my-work-actions"><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button><button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button></div>
        </header>

        {message ? <div className="treasury-my-work-message">{message}</div> : null}

        <div className="treasury-my-work-kpis">
          <article className={summary?.total ? "warning" : "good"}><span>Minha fila</span><strong>{summary?.total ?? 0}</strong><small>{summary?.alerts ?? 0} alerta(s) · {summary?.preventives ?? 0} preventivo(s) · {summary?.tasks ?? 0} pendência(s)</small></article>
          <article className={summary?.escalated ? "danger" : "good"}><span>Escalonados</span><strong>{summary?.escalated ?? 0}</strong><small>SLA operacional ou de preparação vencido</small></article>
          <article className={summary?.dueSoon ? "warning" : "good"}><span>Próximos do SLA</span><strong>{summary?.dueSoon ?? 0}</strong><small>prioridade temporal da fila</small></article>
          <article className={summary?.unacknowledged ? "warning" : "good"}><span>Sem ciência</span><strong>{summary?.unacknowledged ?? 0}</strong><small>alertas atribuídos ainda não reconhecidos</small></article>
          <article><span>Preventivos</span><strong>{summary?.preventives ?? 0}</strong><small>{summary?.preventivePrepared ?? 0} preparado(s)</small></article>
          <article><span>Valor afetado</span><strong>{money(summary?.affectedAmount ?? 0)}</strong><small>somente alertas operacionais e pendências</small></article>
        </div>

        <div className="treasury-my-work-toolbar">
          <div className="treasury-my-work-filters" role="group" aria-label="Filtrar minha fila">
            <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos</button>
            <button type="button" className={filter === "urgent" ? "active" : ""} onClick={() => setFilter("urgent")}>Urgentes</button>
            <button type="button" className={filter === "alerts" ? "active" : ""} onClick={() => setFilter("alerts")}>Alertas</button>
            <button type="button" className={filter === "preventives" ? "active" : ""} onClick={() => setFilter("preventives")}>Preventivos</button>
            <button type="button" className={filter === "tasks" ? "active" : ""} onClick={() => setFilter("tasks")}>Pendências</button>
            <button type="button" className={filter === "waiting" ? "active" : ""} onClick={() => setFilter("waiting")}>Aguardando</button>
          </div>
          <small>{payload?.currentUser.email ?? ""}</small>
        </div>

        <section className="treasury-my-work-card">
          <header><div><small>PRIORIDADE OPERACIONAL</small><h3>O que está comigo</h3></div><strong>{visibleItems.length} item(ns)</strong></header>
          <div className="treasury-my-work-list">
            {visibleItems.length ? visibleItems.map((item) => {
              const escalated = item.kind === "alert" ? Boolean(item.escalationStage) : item.kind === "preventive" ? Boolean(item.preparationEscalatedAt && !item.preparedAt) : false;
              const dueSoon = item.kind !== "task" && item.dueSoon;
              return <article key={`${item.kind}-${item.id}`} className={`${item.kind} ${item.priority}${escalated ? " escalated" : ""}${dueSoon ? " due-soon" : ""}`}>
                <div className="work-meta">
                  <b>{priorityLabel[item.priority]}</b>
                  <span>{item.kind === "task" ? "Pendência de fechamento" : item.alertTypeLabel}</span>
                  {item.kind === "alert" ? item.escalationStage ? <i className="danger">Escalonado</i> : item.dueSoon ? <i className="warning">SLA próximo</i> : item.acknowledgedAt ? <i className="good">Ciente</i> : <i>Sem ciência</i> : item.kind === "preventive" ? item.preparedAt ? <i className="good">Preparado</i> : item.preparationEscalatedAt ? <i className="danger">SLA preparação vencido</i> : item.dueSoon ? <i className="warning">Preparação próxima</i> : item.acknowledgedAt ? <i className="good">Ciente</i> : <i>Sem ciência</i> : <i className={item.status}>{statusLabel[item.status]}</i>}
                </div>
                <div className="work-body">
                  <strong>{item.title}</strong>
                  <small>{item.accountName}{item.kind === "task" && item.bankName ? ` · ${item.bankName}` : ""}</small>
                  <p>{item.detail}</p>
                  <em>{item.recommendedAction}</em>
                  {item.kind === "alert" ? <div className="work-timing"><span>Atribuído: {dateTime(item.assignedAt)}</span><span className={item.escalationStage ? "overdue" : item.dueSoon ? "soon" : ""}>{slaText(item)} · prazo {dateTime(item.slaDueAt)}</span><span>{item.acknowledgedAt ? `Ciência: ${dateTime(item.acknowledgedAt)}` : `Detectado: ${dateTime(item.firstSeenAt)}`}</span></div> : item.kind === "preventive" ? <div className="work-timing"><span>Risco: {shortDate(item.riskDate)} · em {item.daysUntilRisk} dia(s)</span><span className={item.preparationEscalatedAt && !item.preparedAt ? "overdue" : item.dueSoon ? "soon" : ""}>{preventiveSlaText(item)} · prazo {dateTime(item.preparationDueAt)}</span><span>Atribuído: {dateTime(item.assignedAt)}</span></div> : <div className="work-timing"><span>Detectada em {shortDate(item.firstSeenDate)}</span><span>Status: {statusLabel[item.status]}</span><span>{item.assignedName ? `Responsável: ${item.assignedName}` : "Responsável atribuído"}</span></div>}
                </div>
                <div className="work-side">
                  {item.amount > 0 ? <strong>{money(item.amount)}</strong> : null}
                  {item.kind !== "task" && !item.acknowledgedAt ? <button type="button" className="primary" onClick={() => void acknowledge(item)} disabled={savingId === `${item.kind}-ack-${item.id}`}>{savingId === `${item.kind}-ack-${item.id}` ? "Registrando…" : "Reconhecer"}</button> : null}
                  {item.kind === "preventive" && !item.preparedAt ? <button type="button" className="prepare" onClick={() => void prepare(item)} disabled={savingId === `preventive-prepare-${item.id}`}>{savingId === `preventive-prepare-${item.id}` ? "Registrando…" : "Marcar preparado"}</button> : null}
                  {item.kind === "task" && item.status !== "in_progress" ? <button type="button" className="primary" onClick={() => void updateTask(item, "in_progress")} disabled={savingId === `task-${item.id}`}>Iniciar</button> : null}
                  {item.kind === "task" && item.status !== "waiting" ? <button type="button" onClick={() => void updateTask(item, "waiting")} disabled={savingId === `task-${item.id}`}>Aguardar</button> : null}
                  {item.kind === "task" && item.status !== "open" ? <button type="button" onClick={() => void updateTask(item, "open")} disabled={savingId === `task-${item.id}`}>Reabrir fila</button> : null}
                  <button type="button" onClick={() => openSource(item)}>Abrir origem</button>
                </div>
              </article>;
            }) : <div className="treasury-my-work-empty"><strong>Nada neste filtro.</strong><p>Quando um alerta, preventivo ou pendência for atribuído a você, ele aparecerá aqui automaticamente.</p></div>}
          </div>
        </section>

        <footer className="treasury-my-work-footer"><span>A fila é recalculada automaticamente a cada 60 segundos enquanto o TDK Manager estiver aberto.</span><span>Preventivos são separados dos alertas financeiros; “preparado” registra ação preventiva e não significa que o risco técnico já desapareceu.</span></footer>
      </section>
    </div> : null}
  </>;
}
