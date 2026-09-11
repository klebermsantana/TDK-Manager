"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type AlertType = "negative_forecast" | "critical_task" | "reconciliation" | "closing_overdue";
type UserRow = { id: number; name: string; email: string; role: string };
type Assignment = {
  occurrenceId: number;
  status: "active" | "resolved";
  alertType: AlertType;
  severity: "critical" | "high" | "medium";
  title: string;
  accountName: string;
  firstSeenAt: string;
  acknowledgedAt: string | null;
  ackEscalatedAt: string | null;
  resolutionEscalatedAt: string | null;
  assignedUserId: number | null;
  assignedName: string | null;
  assignedEmail: string | null;
  assignedAt: string | null;
  assignmentSource: "manual" | "take" | "escalation_rule" | null;
};
type Rule = {
  id: number;
  alertType: AlertType;
  assignedUserId: number | null;
  assignedName: string | null;
  assignedEmail: string | null;
  active: boolean;
  updatedBy: string | null;
  updatedAt: string;
};
type AssignmentHistory = {
  id: number;
  occurrenceId: number;
  userId: number | null;
  assignedName: string;
  assignedEmail: string;
  assignmentSource: "manual" | "take" | "escalation_rule";
  assignedBy: string;
  assignedAt: string;
  unassignedAt: string | null;
  unassignedBy: string | null;
};
type ResponsibilityPayload = {
  currentUser: { email: string };
  assignments: Assignment[];
  rules: Rule[];
  users: UserRow[];
  history: AssignmentHistory[];
  summary: {
    active: number;
    assigned: number;
    unassigned: number;
    escalated: number;
    escalatedAssigned: number;
    escalatedUnassigned: number;
  };
};

const typeLabel: Record<AlertType, string> = {
  negative_forecast: "Caixa projetado",
  critical_task: "Pendência crítica",
  reconciliation: "Conciliação",
  closing_overdue: "Fechamento",
};
const sourceLabel = {
  manual: "Atribuição manual",
  take: "Responsabilidade assumida",
  escalation_rule: "Regra automática",
} as const;
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
function duration(start: string, end?: string | null) {
  const ms = Math.max(0, (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime());
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export function TreasuryAlertResponsibility() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ResponsibilityPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
      const response = await fetch("/api/treasury-alert-responsibility", { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as ResponsibilityPayload & { error?: string };
      if (!response.ok) {
        if (!silent) setMessage(result.error ?? "Não foi possível carregar os responsáveis dos alertas.");
        return;
      }
      setPayload(result);
      setAuthorized(true);
      setMessage("");
    } catch {
      if (!silent) setMessage("Não foi possível carregar a responsabilidade operacional da Tesouraria.");
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

  async function patch(body: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/treasury-alert-responsibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível atualizar o responsável.");
        return;
      }
      setMessage(successMessage);
      await refresh(true);
    } finally {
      setSaving(false);
    }
  }

  const activeAssignments = useMemo(() => (payload?.assignments ?? [])
    .filter((item) => item.status === "active")
    .sort((a, b) => Number(Boolean(b.ackEscalatedAt || b.resolutionEscalatedAt)) - Number(Boolean(a.ackEscalatedAt || a.resolutionEscalatedAt)) || a.title.localeCompare(b.title)), [payload]);
  const assignmentMap = useMemo(() => new Map((payload?.assignments ?? []).map((item) => [item.occurrenceId, item])), [payload]);
  const history = useMemo(() => [...(payload?.history ?? [])].sort((a, b) => b.assignedAt.localeCompare(a.assignedAt)).slice(0, 80), [payload]);

  if (!target || authorized === false) return null;
  const summary = payload?.summary;
  const tone = summary?.escalatedUnassigned ? "danger" : summary?.unassigned ? "warning" : "clear";

  return <>
    {createPortal(
      <button type="button" className={`treasury-responsibility-trigger ${tone}`} onClick={() => setOpen(true)} disabled={authorized === null}>
        <span>RESPONSÁVEIS</span>
        <strong>{summary?.unassigned ?? "—"}</strong>
        <small>{summary?.escalatedUnassigned ? `${summary.escalatedUnassigned} escalonado(s) sem dono` : summary?.unassigned ? "alerta(s) sem responsável" : "responsabilidade coberta"}</small>
      </button>,
      target,
    )}

    {open ? <div className="treasury-responsibility-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-responsibility-dashboard" role="dialog" aria-modal="true" aria-label="Responsabilidade operacional dos alertas">
        <header className="treasury-responsibility-header">
          <div>
            <small>TESOURARIA · RESPONSABILIDADE OPERACIONAL</small>
            <h2>Responsáveis e escalonamentos</h2>
            <p>Defina responsáveis padrão por tipo de alerta, atribua ocorrências manualmente e acompanhe por quanto tempo cada pessoa permaneceu responsável. Regras automáticas só atuam quando o alerta entra em escalonamento.</p>
          </div>
          <div className="treasury-responsibility-actions"><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button><button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button></div>
        </header>

        {message ? <div className="treasury-responsibility-message">{message}</div> : null}

        <div className="treasury-responsibility-kpis">
          <article><span>Alertas ativos</span><strong>{summary?.active ?? 0}</strong><small>ocorrências em acompanhamento</small></article>
          <article className={summary?.assigned ? "good" : ""}><span>Com responsável</span><strong>{summary?.assigned ?? 0}</strong><small>responsabilidade definida</small></article>
          <article className={summary?.unassigned ? "warning" : "good"}><span>Sem responsável</span><strong>{summary?.unassigned ?? 0}</strong><small>podem ser assumidos manualmente</small></article>
          <article className={summary?.escalatedUnassigned ? "danger" : "good"}><span>Escalados sem dono</span><strong>{summary?.escalatedUnassigned ?? 0}</strong><small>{summary?.escalatedAssigned ?? 0} escalado(s) já atribuídos</small></article>
        </div>

        <div className="treasury-responsibility-grid">
          <section className="treasury-responsibility-card rules-card">
            <header><div><small>ROTEAMENTO AUTOMÁTICO</small><h3>Responsável padrão por tipo</h3></div></header>
            <div className="responsibility-rules">
              {(payload?.rules ?? []).map((rule) => <article key={rule.alertType}>
                <div><strong>{typeLabel[rule.alertType]}</strong><small>{rule.active ? "Regra ativa" : "Regra desativada"}</small></div>
                <select value={rule.assignedUserId ?? ""} disabled={saving} onChange={(event) => void patch({ action: "rule", alertType: rule.alertType, userId: event.target.value || null, active: rule.active }, "Regra de responsabilidade atualizada.")}>
                  <option value="">Sem responsável automático</option>
                  {(payload?.users ?? []).map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
                </select>
                <label><input type="checkbox" checked={rule.active} disabled={saving} onChange={(event) => void patch({ action: "rule", alertType: rule.alertType, userId: rule.assignedUserId, active: event.target.checked }, event.target.checked ? "Regra automática ativada." : "Regra automática desativada.")} /><span>Usar no escalonamento</span></label>
              </article>)}
            </div>
            <p className="responsibility-note">Uma regra sem usuário definido não atribui ninguém. A automação nunca troca um responsável que já tenha sido definido manualmente.</p>
          </section>

          <section className="treasury-responsibility-card current-card">
            <header><div><small>OCORRÊNCIAS ATIVAS</small><h3>Quem está cuidando de cada alerta</h3></div><strong>{activeAssignments.length} alerta(s)</strong></header>
            <div className="responsibility-list">
              {activeAssignments.length ? activeAssignments.map((item) => {
                const escalated = Boolean(item.ackEscalatedAt || item.resolutionEscalatedAt);
                return <article key={item.occurrenceId} className={escalated ? "escalated" : ""}>
                  <div className="responsibility-alert-main">
                    <div className="responsibility-badges"><span>{typeLabel[item.alertType]}</span><b>{item.severity === "critical" ? "Crítico" : item.severity === "high" ? "Alto" : "Médio"}</b>{escalated ? <i>Escalonado</i> : null}</div>
                    <strong>{item.title}</strong><small>{item.accountName} · detectado {dateTime(item.firstSeenAt)}</small>
                    {item.assignedEmail ? <p>Responsável atual: <b>{item.assignedName}</b> · {item.assignedEmail} · desde {dateTime(item.assignedAt)}{item.assignmentSource ? ` · ${sourceLabel[item.assignmentSource]}` : ""}</p> : <p className="unassigned-text">Ainda sem responsável.</p>}
                  </div>
                  <div className="responsibility-controls">
                    <select value={item.assignedUserId ?? ""} disabled={saving} onChange={(event) => void patch({ action: "assign", occurrenceId: item.occurrenceId, userId: event.target.value || null }, event.target.value ? "Responsável atualizado." : "Responsável removido.")}>
                      <option value="">Sem responsável</option>
                      {(payload?.users ?? []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                    {item.assignedEmail?.toLowerCase() !== payload?.currentUser.email.toLowerCase() ? <button type="button" onClick={() => void patch({ action: "take", occurrenceId: item.occurrenceId }, "Responsabilidade assumida.")} disabled={saving}>Assumir</button> : <span className="mine">Com você</span>}
                  </div>
                </article>;
              }) : <div className="responsibility-empty"><strong>Nenhum alerta ativo.</strong><p>Não há responsabilidade operacional pendente neste momento.</p></div>}
            </div>
          </section>

          <section className="treasury-responsibility-card wide history-card">
            <header><div><small>HISTÓRICO DE RESPONSABILIDADE</small><h3>Quem ficou responsável e por quanto tempo</h3></div><strong>{history.length} registro(s)</strong></header>
            <div className="responsibility-history">
              {history.length ? history.map((row) => {
                const occurrence = assignmentMap.get(row.occurrenceId);
                return <article key={row.id}>
                  <div><strong>{row.assignedName}</strong><small>{row.assignedEmail}</small></div>
                  <div><b>{occurrence?.title ?? `Alerta #${row.occurrenceId}`}</b><small>{occurrence ? typeLabel[occurrence.alertType] : "Ocorrência histórica"} · {sourceLabel[row.assignmentSource]}</small></div>
                  <div><span>Entrada</span><strong>{dateTime(row.assignedAt)}</strong></div>
                  <div><span>Saída</span><strong>{row.unassignedAt ? dateTime(row.unassignedAt) : "Atual"}</strong></div>
                  <div><span>Tempo responsável</span><strong>{duration(row.assignedAt, row.unassignedAt)}</strong></div>
                  <div><span>Atribuído por</span><strong>{row.assignedBy}</strong></div>
                </article>;
              }) : <div className="responsibility-empty"><strong>Histórico ainda vazio.</strong><p>A trilha será formada a partir das novas atribuições.</p></div>}
            </div>
          </section>
        </div>

        <footer className="treasury-responsibility-footer">Atribuição define responsabilidade operacional; não reconhece o alerta, não altera sua gravidade e não executa nenhuma ação financeira. Ao normalizar uma ocorrência, o período do responsável é encerrado automaticamente no histórico.</footer>
      </section>
    </div> : null}
  </>;
}
