"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Period = "30" | "90" | "180" | "all";
type Person = {
  id: number;
  name: string;
  email: string;
  role: string;
  activeLoad: number;
  activeAlerts: number;
  activeTasks: number;
  escalatedActive: number;
  criticalActive: number;
  alertsHandled: number;
  tasksTouched: number;
  taskActions: number;
  acknowledgements: number;
  normalizations: number;
  mttaMinutes: number | null;
  mttrMinutes: number | null;
  avgResponsibilityMinutes: number | null;
  ackBreaches: number;
  resolutionBreaches: number;
  slaBreaches: number;
};
type Activity = {
  email: string;
  at: string;
  kind: "assignment" | "acknowledgement" | "normalization" | "sla_breach" | "task";
  title: string;
  detail: string;
};
type CurrentAlert = { id: number; email: string; title: string; priority: string; accountName: string; escalated: boolean };
type CurrentTask = { id: number; email: string; title: string; priority: string; status: string; affectedAmount: number };
type Payload = {
  generatedAt: string;
  period: Period;
  startAt: string | null;
  currentUser: { email: string };
  people: Person[];
  activities: Activity[];
  currentItems: { alerts: CurrentAlert[]; tasks: CurrentTask[] };
  summary: {
    activeLoad: number;
    activeAlerts: number;
    activeTasks: number;
    unassigned: number;
    escalatedActive: number;
    criticalActive: number;
    alertsHandled: number;
    tasksTouched: number;
    acknowledgements: number;
    normalizations: number;
    mttaMinutes: number | null;
    mttrMinutes: number | null;
    slaBreaches: number;
  };
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const roleLabel: Record<string, string> = { admin: "Administrador", manager: "Gestor", seller: "Comercial", finance: "Financeiro", viewer: "Consulta" };
const statusLabel: Record<string, string> = { open: "Aberta", in_progress: "Em andamento", waiting: "Aguardando" };
const priorityLabel: Record<string, string> = { critical: "Crítica", high: "Alta", medium: "Média" };
const activityLabel = {
  assignment: "Atribuição",
  acknowledgement: "Ciência",
  normalization: "Normalização",
  sla_breach: "SLA rompido",
  task: "Pendência",
} as const;

function minutesLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const minutes = Math.max(0, Math.round(value));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest ? `${hours}h ${rest}min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days} d`;
}

function periodLabel(period: Period) {
  if (period === "all") return "Todo o histórico";
  return `Últimos ${period} dias`;
}

export function TreasuryProductivityDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [period, setPeriod] = useState<Period>("90");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  useEffect(() => {
    const locate = () => setTarget(document.querySelector<HTMLElement>(".receivable-metrics"));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function refresh(silent = false, requestedPeriod = period) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/treasury-productivity?period=${requestedPeriod}`, { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) {
        if (!silent) setMessage(result.error ?? "Não foi possível carregar a produtividade da Tesouraria.");
        return;
      }
      setPayload(result);
      setAuthorized(true);
      setMessage("");
      setSelectedEmail((current) => {
        if (current && result.people.some((person) => person.email.toLowerCase() === current.toLowerCase())) return current;
        const mine = result.people.find((person) => person.email.toLowerCase() === result.currentUser.email.toLowerCase());
        return mine?.email ?? result.people[0]?.email ?? null;
      });
    } catch {
      if (!silent) setMessage("Não foi possível carregar a produtividade da Tesouraria.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { if (target && authorized === null) void refresh(true); }, [target, authorized]);
  useEffect(() => {
    if (!target || authorized === false) return;
    const timer = window.setInterval(() => void refresh(true), 60000);
    return () => window.clearInterval(timer);
  }, [target, authorized, period]);
  useEffect(() => { if (open) void refresh(); }, [open]);

  const visiblePeople = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (payload?.people ?? []).filter((person) => !term || `${person.name} ${person.email} ${person.role}`.toLowerCase().includes(term));
  }, [payload, search]);

  const selectedPerson = useMemo(() => (payload?.people ?? []).find((person) => person.email.toLowerCase() === selectedEmail?.toLowerCase()) ?? null, [payload, selectedEmail]);
  const selectedAlerts = useMemo(() => (payload?.currentItems.alerts ?? []).filter((item) => item.email.toLowerCase() === selectedEmail?.toLowerCase()), [payload, selectedEmail]);
  const selectedTasks = useMemo(() => (payload?.currentItems.tasks ?? []).filter((item) => item.email.toLowerCase() === selectedEmail?.toLowerCase()), [payload, selectedEmail]);
  const selectedActivities = useMemo(() => (payload?.activities ?? []).filter((item) => item.email.toLowerCase() === selectedEmail?.toLowerCase()).slice(0, 30), [payload, selectedEmail]);

  if (!target || authorized === false) return null;
  const summary = payload?.summary;
  const tone = summary?.escalatedActive ? "danger" : summary?.criticalActive ? "warning" : "clear";

  return <>
    {createPortal(
      <button type="button" className={`treasury-productivity-trigger ${tone}`} onClick={() => setOpen(true)} disabled={authorized === null}>
        <span>PRODUTIVIDADE</span>
        <strong>{summary?.activeLoad ?? "—"}</strong>
        <small>{summary?.escalatedActive ? `${summary.escalatedActive} escalonado(s) na equipe` : "carga + tempos + SLA"}</small>
      </button>,
      target,
    )}

    {open ? <div className="treasury-productivity-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-productivity-dashboard" role="dialog" aria-modal="true" aria-label="Produtividade da Tesouraria por responsável">
        <header className="treasury-productivity-header">
          <div>
            <small>TESOURARIA · GESTÃO DE EQUIPE</small>
            <h2>Produtividade por responsável</h2>
            <p>Compara carga, atividade, tempos e SLA sem criar nota única de desempenho. MTTA e MTTR são operacionais: contam a partir do início da responsabilidade daquela pessoa, evitando atribuir a ela atrasos anteriores a uma transferência.</p>
          </div>
          <div className="treasury-productivity-actions">
            <label><span>Período</span><select value={period} onChange={(event) => { const value = event.target.value as Period; setPeriod(value); void refresh(false, value); }}><option value="30">30 dias</option><option value="90">90 dias</option><option value="180">180 dias</option><option value="all">Todo o histórico</option></select></label>
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="treasury-productivity-message">{message}</div> : null}

        <div className="treasury-productivity-kpis">
          <article className={summary?.activeLoad ? "warning" : "good"}><span>Carga atual da equipe</span><strong>{summary?.activeLoad ?? 0}</strong><small>{summary?.activeAlerts ?? 0} alerta(s) · {summary?.activeTasks ?? 0} pendência(s)</small></article>
          <article className={summary?.escalatedActive ? "danger" : "good"}><span>Escalonados agora</span><strong>{summary?.escalatedActive ?? 0}</strong><small>{summary?.criticalActive ?? 0} item(ns) crítico(s) em carga</small></article>
          <article className={summary?.unassigned ? "warning" : "good"}><span>Sem responsável</span><strong>{summary?.unassigned ?? 0}</strong><small>fora das métricas individuais até receberem dono</small></article>
          <article><span>MTTA operacional</span><strong>{minutesLabel(summary?.mttaMinutes ?? null)}</strong><small>{summary?.acknowledgements ?? 0} ciência(s) no período</small></article>
          <article><span>MTTR operacional</span><strong>{minutesLabel(summary?.mttrMinutes ?? null)}</strong><small>{summary?.normalizations ?? 0} normalização(ões)</small></article>
          <article className={summary?.slaBreaches ? "danger" : "good"}><span>Rompimentos de SLA</span><strong>{summary?.slaBreaches ?? 0}</strong><small>atribuídos ao responsável no instante da violação</small></article>
          <article><span>Alertas sob responsabilidade</span><strong>{summary?.alertsHandled ?? 0}</strong><small>{periodLabel(period)}</small></article>
          <article><span>Pendências movimentadas</span><strong>{summary?.tasksTouched ?? 0}</strong><small>interações reais registradas</small></article>
        </div>

        <section className="treasury-productivity-card wide team-card">
          <header>
            <div><small>VISÃO COMPARATIVA</small><h3>Equipe da Tesouraria</h3></div>
            <label className="search"><span>Buscar responsável</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou e-mail..." /></label>
          </header>
          <div className="treasury-productivity-table">
            <div className="head"><span>Responsável</span><span>Carga atual</span><span>Escalados</span><span>Alertas</span><span>Pendências</span><span>MTTA</span><span>MTTR</span><span>SLA</span><span>Tempo responsável</span></div>
            {visiblePeople.length ? visiblePeople.map((person) => <button type="button" className={`row ${selectedEmail?.toLowerCase() === person.email.toLowerCase() ? "selected" : ""}`} key={person.id} onClick={() => setSelectedEmail(person.email)}>
              <div><strong>{person.name}</strong><small>{person.email} · {roleLabel[person.role] ?? person.role}</small></div>
              <div><strong>{person.activeLoad}</strong><small>{person.activeAlerts} alerta(s) · {person.activeTasks} pendência(s)</small></div>
              <strong className={person.escalatedActive ? "danger-text" : "good-text"}>{person.escalatedActive}</strong>
              <div><strong>{person.alertsHandled}</strong><small>{person.acknowledgements} ciência(s) · {person.normalizations} normalização(ões)</small></div>
              <div><strong>{person.tasksTouched}</strong><small>{person.taskActions} interação(ões)</small></div>
              <strong>{minutesLabel(person.mttaMinutes)}</strong>
              <strong>{minutesLabel(person.mttrMinutes)}</strong>
              <div><strong className={person.slaBreaches ? "danger-text" : "good-text"}>{person.slaBreaches}</strong><small>{person.ackBreaches} ciência · {person.resolutionBreaches} normalização</small></div>
              <strong>{minutesLabel(person.avgResponsibilityMinutes)}</strong>
            </button>) : <div className="treasury-productivity-empty"><strong>Nenhum responsável encontrado.</strong><p>Revise o filtro de busca.</p></div>}
          </div>
          <p className="treasury-productivity-note">A tabela não é um ranking de “melhor/pior”. Uma carga maior pode elevar tempos e volume; os indicadores devem ser lidos em conjunto. Pendências de fechamento contam apenas interações auditadas, porque a resolução técnica pode acontecer automaticamente após a causa desaparecer.</p>
        </section>

        {selectedPerson ? <div className="treasury-productivity-detail-grid">
          <section className="treasury-productivity-card detail-card">
            <header><div><small>RESPONSÁVEL SELECIONADO</small><h3>{selectedPerson.name}</h3></div><strong>{selectedPerson.activeLoad} item(ns) atuais</strong></header>
            <div className="person-summary">
              <article><span>MTTA</span><strong>{minutesLabel(selectedPerson.mttaMinutes)}</strong><small>após assumir</small></article>
              <article><span>MTTR</span><strong>{minutesLabel(selectedPerson.mttrMinutes)}</strong><small>até normalização</small></article>
              <article><span>SLA rompido</span><strong>{selectedPerson.slaBreaches}</strong><small>{selectedPerson.ackBreaches} + {selectedPerson.resolutionBreaches}</small></article>
              <article><span>Tempo médio responsável</span><strong>{minutesLabel(selectedPerson.avgResponsibilityMinutes)}</strong><small>no período selecionado</small></article>
            </div>
            <div className="current-work">
              <h4>Carga atual</h4>
              {selectedAlerts.map((item) => <article key={`a-${item.id}`} className={item.escalated ? "escalated" : ""}><div><b>Alerta · {priorityLabel[item.priority] ?? item.priority}</b>{item.escalated ? <i>Escalonado</i> : null}</div><strong>{item.title}</strong><small>{item.accountName}</small></article>)}
              {selectedTasks.map((item) => <article key={`t-${item.id}`}><div><b>Pendência · {priorityLabel[item.priority] ?? item.priority}</b><i>{statusLabel[item.status] ?? item.status}</i></div><strong>{item.title}</strong><small>{item.affectedAmount ? `Valor afetado: ${money(Math.abs(item.affectedAmount))}` : "Sem valor financeiro direto informado"}</small></article>)}
              {!selectedAlerts.length && !selectedTasks.length ? <div className="treasury-productivity-empty compact"><strong>Sem carga atual.</strong><p>Não há alerta ou pendência ativa atribuída a este responsável.</p></div> : null}
            </div>
          </section>

          <section className="treasury-productivity-card activity-card">
            <header><div><small>TRILHA OPERACIONAL</small><h3>Atividade recente</h3></div><strong>{selectedActivities.length} evento(s)</strong></header>
            <div className="productivity-activity">
              {selectedActivities.length ? selectedActivities.map((activity, index) => <article key={`${activity.at}-${activity.kind}-${index}`} className={activity.kind}>
                <div><b>{activityLabel[activity.kind]}</b><span>{dateTime(activity.at)}</span></div>
                <strong>{activity.title}</strong><small>{activity.detail}</small>
              </article>) : <div className="treasury-productivity-empty"><strong>Sem atividade neste período.</strong><p>Não há eventos auditados para o responsável selecionado.</p></div>}
            </div>
          </section>
        </div> : null}

        <footer className="treasury-productivity-footer">
          <span>Período analisado: {periodLabel(period)} · atualização automática a cada 60 segundos.</span>
          <span>MTTA/MTTR individuais medem o trecho sob responsabilidade; rompimentos de SLA são atribuídos ao responsável vigente no instante da violação.</span>
        </footer>
      </section>
    </div> : null}
  </>;
}
