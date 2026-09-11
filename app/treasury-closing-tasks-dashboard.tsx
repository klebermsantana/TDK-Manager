"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Task = {
  id: number;
  issueKey: string;
  scope: "account" | "global";
  bankAccountId: number | null;
  issueType: string;
  title: string;
  detail: string;
  recommendedAction: string;
  priority: "critical" | "high" | "medium";
  affectedAmount: number;
  status: "open" | "in_progress" | "waiting" | "resolved";
  assignedUserId: number | null;
  assignedName: string | null;
  assignedEmail: string | null;
  sourceActive: boolean;
  firstSeenDate: string;
  lastSeenDate: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  accountName: string;
  bankName: string | null;
};

type User = { id: number; name: string; email: string; role: string };
type Audit = { id: number; taskId: number; action: string; fromStatus: string | null; toStatus: string | null; performedBy: string; note: string | null; createdAt: string };
type Payload = {
  date: string;
  tasks: Task[];
  users: User[];
  currentUser: { email: string };
  audit: Audit[];
  summary: { active: number; critical: number; high: number; medium: number; unassigned: number; inProgress: number; waiting: number; affectedAmount: number };
};

type ViewFilter = "active" | "all" | "resolved";

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "—";
const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const priorityLabel = { critical: "Crítica", high: "Alta", medium: "Média" } as const;
const statusLabel = { open: "Aberta", in_progress: "Em andamento", waiting: "Aguardando", resolved: "Resolvida" } as const;
const actionLabel = (action: string) => action === "detected" ? "Detectada" : action === "auto_resolve" ? "Resolvida automaticamente" : action === "auto_reopen" ? "Reaberta automaticamente" : action === "take" ? "Assumida" : action === "assign" ? "Atribuída" : action === "unassign" ? "Responsável removido" : action === "comment" ? "Observação" : "Status alterado";

function ageDays(value: string) {
  const start = new Date(`${value}T12:00:00Z`).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 86400000));
}

export function TreasuryClosingTasksDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<ViewFilter>("active");
  const [priority, setPriority] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const locate = () => setTarget(document.querySelector<HTMLElement>(".treasury-actions"));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/treasury-closing-tasks", { cache: "no-store" });
      if (response.status === 403) { setAuthorized(false); setPayload(null); return; }
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) { setMessage(result.error ?? "Não foi possível carregar as pendências."); return; }
      setPayload(result);
      setAuthorized(true);
      setMessage("");
    } catch {
      setMessage("Não foi possível carregar as pendências da Tesouraria.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { if (target && authorized === null) void refresh(true); }, [target, authorized]);
  useEffect(() => { if (open) void refresh(); }, [open]);

  async function patch(task: Task, body: Record<string, unknown>, success: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-closing-tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: task.id, ...body }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setMessage(result.error ?? "Não foi possível atualizar a pendência."); return; }
      setMessage(success);
      await refresh(true);
    } finally { setLoading(false); }
  }

  function addComment(task: Task) {
    const note = window.prompt(`Observação para “${task.title}”:`);
    if (!note?.trim()) return;
    void patch(task, { action: "comment", note: note.trim() }, "Observação registrada na auditoria da pendência.");
  }

  function openSource(task: Task) {
    setOpen(false);
    window.setTimeout(() => {
      if (["statement_missing", "statement_outdated", "statement_balance_missing", "unallocated_statement"].includes(task.issueType)) {
        document.querySelector<HTMLButtonElement>(".recon-trigger")?.click();
        return;
      }
      if (task.issueType === "ledger_unassigned") {
        document.querySelector<HTMLButtonElement>(".ledger-trigger")?.click();
        return;
      }
      document.querySelector<HTMLButtonElement>(".treasury-closing-trigger")?.click();
    }, 0);
  }

  const rows = useMemo(() => {
    const currentEmail = payload?.currentUser.email ?? "";
    const term = search.trim().toLowerCase();
    return (payload?.tasks ?? []).filter((task) => {
      if (view === "active" && (!task.sourceActive || task.status === "resolved")) return false;
      if (view === "resolved" && task.status !== "resolved") return false;
      if (priority !== "all" && task.priority !== priority) return false;
      if (assignee === "unassigned" && task.assignedEmail) return false;
      if (assignee === "me" && task.assignedEmail?.toLowerCase() !== currentEmail.toLowerCase()) return false;
      if (assignee.startsWith("user:") && String(task.assignedUserId ?? "") !== assignee.slice(5)) return false;
      if (term && !`${task.title} ${task.detail} ${task.accountName} ${task.bankName ?? ""} ${task.assignedName ?? ""} ${task.assignedEmail ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [payload, view, priority, assignee, search]);

  if (!target || authorized === false) return null;
  const summary = payload?.summary;
  const trigger = <button type="button" className={`treasury-tasks-trigger${summary?.critical ? " alert" : ""}`} onClick={() => setOpen(true)} disabled={authorized === null}>
    <span>PENDÊNCIAS</span>
    <strong>{summary?.active ?? "—"}</strong>
    <small>{summary?.critical ? `${summary.critical} crítica(s)` : "fila operacional"}</small>
  </button>;

  return <>
    {createPortal(trigger, target)}
    {open ? <div className="treasury-tasks-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-tasks-dashboard" role="dialog" aria-modal="true" aria-label="Pendências da Tesouraria">
        <header className="treasury-tasks-header">
          <div><small>FINANCEIRO · TESOURARIA</small><h2>Pendências de fechamento</h2><p>Fila operacional gerada pela conferência real da Tesouraria. Resolver a tarefa não oculta a causa técnica: enquanto a origem persistir, a pendência continua ativa.</p></div>
          <div className="treasury-tasks-actions"><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar origem"}</button><button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button></div>
        </header>

        {message ? <div className="treasury-tasks-message">{message}</div> : null}

        <div className="treasury-tasks-kpis">
          <article className={summary?.critical ? "danger" : "good"}><span>Pendências ativas</span><strong>{summary?.active ?? 0}</strong><small>{summary?.critical ?? 0} crítica(s)</small></article>
          <article className={summary?.high ? "warning" : ""}><span>Prioridade alta</span><strong>{summary?.high ?? 0}</strong><small>{summary?.medium ?? 0} de prioridade média</small></article>
          <article className={summary?.unassigned ? "warning" : "good"}><span>Sem responsável</span><strong>{summary?.unassigned ?? 0}</strong><small>precisam de dono operacional</small></article>
          <article><span>Em andamento</span><strong>{summary?.inProgress ?? 0}</strong><small>{summary?.waiting ?? 0} aguardando</small></article>
          <article><span>Valor afetado</span><strong>{money(summary?.affectedAmount ?? 0)}</strong><small>diferenças + valores não conciliados</small></article>
          <article><span>Conferência</span><strong>{shortDate(payload?.date ?? null)}</strong><small>fonte técnica da fila</small></article>
        </div>

        <div className="treasury-tasks-filters">
          <label><span>Visão</span><select value={view} onChange={(event) => setView(event.target.value as ViewFilter)}><option value="active">Ativas</option><option value="resolved">Resolvidas</option><option value="all">Todas</option></select></label>
          <label><span>Prioridade</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">Todas</option><option value="critical">Crítica</option><option value="high">Alta</option><option value="medium">Média</option></select></label>
          <label><span>Responsável</span><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="all">Todos</option><option value="unassigned">Sem responsável</option><option value="me">Minhas pendências</option>{(payload?.users ?? []).map((user) => <option key={user.id} value={`user:${user.id}`}>{user.name}</option>)}</select></label>
          <label className="search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Conta, pendência, responsável..." /></label>
        </div>

        <section className="treasury-tasks-card wide">
          <header><div><small>FILA OPERACIONAL</small><h3>O que impede o fechamento</h3></div><strong>{rows.length} item(ns)</strong></header>
          <div className="treasury-tasks-list">
            {rows.map((task) => <article key={task.id} className={`${task.priority} ${task.sourceActive ? "active-source" : "inactive-source"}`}>
              <div className="task-priority"><b>{priorityLabel[task.priority]}</b><small>{statusLabel[task.status]}</small></div>
              <div className="task-main">
                <div className="task-title"><strong>{task.title}</strong><span>{task.accountName}{task.bankName ? ` · ${task.bankName}` : ""}</span></div>
                <p>{task.detail}</p>
                <div className="task-action"><span>Ação recomendada</span><strong>{task.recommendedAction}</strong></div>
                <small>Detectada em {shortDate(task.firstSeenDate)} · {ageDays(task.firstSeenDate)} dia(s) na fila · última validação {shortDate(task.lastSeenDate)}</small>
              </div>
              <div className="task-value"><span>Valor afetado</span><strong>{Number(task.affectedAmount) > 0.009 ? money(task.affectedAmount) : "—"}</strong><small>{task.sourceActive ? "causa técnica ativa" : "causa não detectada"}</small></div>
              <div className="task-owner">
                <label><span>Responsável</span><select value={task.assignedUserId ? String(task.assignedUserId) : ""} onChange={(event) => void patch(task, { action: "assign", userId: event.target.value || null }, event.target.value ? "Responsável atualizado." : "Responsável removido.")} disabled={loading}><option value="">Sem responsável</option>{(payload?.users ?? []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
                {!task.assignedEmail && task.sourceActive ? <button type="button" onClick={() => void patch(task, { action: "take" }, "Pendência atribuída a você.")} disabled={loading}>Assumir</button> : <small>{task.assignedEmail ?? ""}</small>}
              </div>
              <div className="task-status">
                <label><span>Status operacional</span><select value={task.status} onChange={(event) => void patch(task, { action: "status", status: event.target.value }, "Status operacional atualizado.")} disabled={loading}><option value="open">Aberta</option><option value="in_progress">Em andamento</option><option value="waiting">Aguardando</option>{!task.sourceActive ? <option value="resolved">Resolvida</option> : null}</select></label>
                <div className="buttons"><button type="button" onClick={() => openSource(task)}>{task.issueType === "ledger_unassigned" ? "Abrir razão" : ["statement_missing", "statement_outdated", "statement_balance_missing", "unallocated_statement"].includes(task.issueType) ? "Abrir conciliação" : "Abrir conferência"}</button><button type="button" className="secondary" onClick={() => addComment(task)}>Observação</button></div>
              </div>
            </article>)}
            {!rows.length ? <p className="empty">Nenhuma pendência encontrada com os filtros selecionados.</p> : null}
          </div>
        </section>

        {(payload?.audit?.length ?? 0) > 0 ? <section className="treasury-tasks-card audit-card">
          <header><div><small>AUDITORIA</small><h3>Movimentações recentes da fila</h3></div><strong>{Math.min(payload?.audit.length ?? 0, 16)}</strong></header>
          <div className="treasury-tasks-audit">{payload?.audit.slice(0, 16).map((event) => {
            const task = payload.tasks.find((item) => item.id === event.taskId);
            return <article key={event.id}><div><strong>{actionLabel(event.action)} · {task?.title ?? `Pendência #${event.taskId}`}</strong><small>{event.performedBy} · {dateTime(event.createdAt)}</small></div><span>{event.note ?? (event.fromStatus && event.toStatus ? `${event.fromStatus} → ${event.toStatus}` : "")}</span></article>;
          })}</div>
        </section> : null}

        <footer className="treasury-tasks-footer"><span>Pendências técnicas são sincronizadas automaticamente com a conferência atual. Se uma causa resolvida reaparecer, a tarefa é reaberta automaticamente.</span><span>Somente usuários com acesso à Tesouraria aparecem como responsáveis disponíveis.</span></footer>
      </section>
    </div> : null}
  </>;
}
