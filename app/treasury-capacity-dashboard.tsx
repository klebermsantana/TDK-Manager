"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type CapacityState = "available" | "balanced" | "overloaded";
type Priority = "critical" | "high" | "medium";
type Person = {
  id: number;
  name: string;
  email: string;
  role: string;
  points: number;
  items: number;
  alerts: number;
  tasks: number;
  critical: number;
  escalated: number;
  dueSoon: number;
  state: CapacityState;
  utilizationPct: number;
};
type LoadItem = {
  key: string;
  kind: "alert" | "task";
  id: number;
  title: string;
  detail: string;
  priority: Priority;
  accountName: string;
  ownerUserId: number | null;
  ownerName: string | null;
  ownerEmail: string | null;
  weight: number;
  escalated: boolean;
  dueSoon: boolean;
  slaRemainingMinutes: number | null;
  acknowledged: boolean;
  status: string;
};
type Suggestion = {
  key: string;
  kind: "alert" | "task";
  itemId: number;
  itemTitle: string;
  priority: Priority;
  weight: number;
  escalated: boolean;
  dueSoon: boolean;
  fromUserId: number | null;
  fromName: string;
  toUserId: number;
  toName: string;
  reason: string;
};
type Payload = {
  generatedAt: string;
  currentUser: { id: number | null; email: string };
  referencePoints: number;
  thresholds: { overload: number; available: number };
  people: Person[];
  items: LoadItem[];
  suggestions: Suggestion[];
  summary: {
    people: number;
    totalItems: number;
    totalPoints: number;
    overloaded: number;
    balanced: number;
    available: number;
    unassigned: number;
    escalated: number;
    dueSoon: number;
    suggestions: number;
  };
  methodology: {
    alertWeights: string;
    taskWeights: string;
    note: string;
  };
};

type Filter = "all" | "overloaded" | "unassigned" | "urgent";

const roleLabel: Record<string, string> = { admin: "Administrador", manager: "Gestor", seller: "Comercial", finance: "Financeiro", viewer: "Consulta" };
const stateLabel: Record<CapacityState, string> = { available: "Capacidade disponível", balanced: "Equilibrado", overloaded: "Sobrecarregado" };
const priorityLabel: Record<Priority, string> = { critical: "Crítica", high: "Alta", medium: "Média" };
const statusLabel: Record<string, string> = { open: "Aberta", in_progress: "Em andamento", waiting: "Aguardando", acknowledged: "Com ciência", unacknowledged: "Sem ciência" };

function minutesLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const absolute = Math.abs(Math.round(value));
  if (absolute < 60) return `${absolute} min`;
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  if (hours < 48) return minutes ? `${hours}h ${minutes}min` : `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export function TreasuryCapacityDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedPerson, setSelectedPerson] = useState<number | null>(null);
  const [pendingTargets, setPendingTargets] = useState<Record<string, string>>({});

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
      const response = await fetch("/api/treasury-capacity", { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) {
        if (!silent) setMessage(result.error ?? "Não foi possível carregar a capacidade da Tesouraria.");
        return;
      }
      setPayload(result);
      setAuthorized(true);
      setMessage("");
      setSelectedPerson((current) => current && result.people.some((person) => person.id === current) ? current : result.people[0]?.id ?? null);
    } catch {
      if (!silent) setMessage("Não foi possível carregar a capacidade da Tesouraria.");
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
    if (filter === "all") return selectedPerson === null || item.ownerUserId === selectedPerson;
    if (filter === "unassigned") return !item.ownerUserId && !item.ownerEmail;
    if (filter === "urgent") return item.escalated || item.dueSoon || item.priority === "critical";
    const owner = payload?.people.find((person) => person.id === item.ownerUserId || person.email.toLowerCase() === item.ownerEmail?.toLowerCase());
    return owner?.state === "overloaded";
  }), [payload, filter, selectedPerson]);

  async function assign(kind: "alert" | "task", itemId: number, userId: number | null, key: string, success: string) {
    setSavingKey(key);
    try {
      const response = await fetch(kind === "alert" ? "/api/treasury-alert-responsibility" : "/api/treasury-closing-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "alert"
          ? { action: "assign", occurrenceId: itemId, userId }
          : { action: "assign", id: itemId, userId }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível redistribuir o item.");
        return;
      }
      setMessage(success);
      setPendingTargets((current) => ({ ...current, [key]: "" }));
      await refresh(true);
    } finally {
      setSavingKey(null);
    }
  }

  async function applySuggestion(suggestion: Suggestion) {
    await assign(
      suggestion.kind,
      suggestion.itemId,
      suggestion.toUserId,
      suggestion.key,
      `Redistribuição concluída: ${suggestion.itemTitle} → ${suggestion.toName}.`,
    );
  }

  if (!target || authorized === false) return null;
  const summary = payload?.summary;
  const tone = summary?.overloaded ? "danger" : summary?.unassigned || summary?.dueSoon ? "warning" : "clear";

  return <>
    {createPortal(
      <button type="button" className={`treasury-capacity-trigger ${tone}`} onClick={() => setOpen(true)} disabled={authorized === null}>
        <span>CAPACIDADE</span>
        <strong>{summary?.overloaded ?? "—"}</strong>
        <small>{summary?.overloaded ? "pessoa(s) sobrecarregada(s)" : summary?.unassigned ? `${summary.unassigned} item(ns) sem responsável` : "distribuição equilibrada"}</small>
      </button>,
      target,
    )}

    {open ? <div className="treasury-capacity-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-capacity-dashboard" role="dialog" aria-modal="true" aria-label="Capacidade e distribuição de carga da Tesouraria">
        <header className="treasury-capacity-header">
          <div>
            <small>TESOURARIA · GESTÃO DE CAPACIDADE</small>
            <h2>Capacidade e distribuição de carga</h2>
            <p>A carga pondera prioridade, escalonamento e proximidade do SLA. O sistema sugere redistribuições, mas nenhuma troca de responsável acontece automaticamente nesta tela.</p>
          </div>
          <div className="treasury-capacity-actions">
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="treasury-capacity-message">{message}</div> : null}

        <div className="treasury-capacity-kpis">
          <article><span>Carga ponderada</span><strong>{summary?.totalPoints ?? 0}</strong><small>{summary?.totalItems ?? 0} item(ns) ativos</small></article>
          <article className={summary?.overloaded ? "danger" : "good"}><span>Sobrecarregados</span><strong>{summary?.overloaded ?? 0}</strong><small>limite atual: {payload?.thresholds.overload ?? 0} pontos</small></article>
          <article className="good"><span>Com capacidade</span><strong>{summary?.available ?? 0}</strong><small>até {payload?.thresholds.available ?? 0} pontos, sem escalonamento</small></article>
          <article className={summary?.unassigned ? "warning" : "good"}><span>Sem responsável</span><strong>{summary?.unassigned ?? 0}</strong><small>precisam de distribuição</small></article>
          <article className={summary?.escalated ? "danger" : "good"}><span>Escalonados</span><strong>{summary?.escalated ?? 0}</strong><small>{summary?.dueSoon ?? 0} próximo(s) do SLA</small></article>
          <article className={summary?.suggestions ? "warning" : "good"}><span>Sugestões</span><strong>{summary?.suggestions ?? 0}</strong><small>dependem de aprovação do gestor</small></article>
        </div>

        <section className="treasury-capacity-card wide team-card">
          <header><div><small>DISTRIBUIÇÃO ATUAL</small><h3>Carga por responsável</h3></div><strong>Referência da equipe: {payload?.referencePoints ?? 0} pts</strong></header>
          <div className="capacity-people">
            {(payload?.people ?? []).map((person) => <button type="button" key={person.id} className={`${person.state} ${selectedPerson === person.id ? "selected" : ""}`} onClick={() => { setSelectedPerson(person.id); setFilter("all"); }}>
              <div className="capacity-person-title"><div><strong>{person.name}</strong><small>{roleLabel[person.role] ?? person.role}</small></div><b>{stateLabel[person.state]}</b></div>
              <div className="capacity-meter"><span style={{ width: `${Math.min(100, person.utilizationPct)}%` }} /></div>
              <div className="capacity-person-stats"><span><b>{person.points}</b> pts</span><span><b>{person.items}</b> itens</span><span><b>{person.critical}</b> críticos</span><span><b>{person.escalated}</b> escalados</span></div>
              <small>{person.alerts} alerta(s) · {person.tasks} pendência(s){person.dueSoon ? ` · ${person.dueSoon} perto do SLA` : ""}</small>
            </button>)}
          </div>
        </section>

        <div className="treasury-capacity-grid">
          <section className="treasury-capacity-card suggestions-card">
            <header><div><small>REDISTRIBUIÇÃO ASSISTIDA</small><h3>Sugestões de balanceamento</h3></div><strong>{payload?.suggestions.length ?? 0}</strong></header>
            <div className="capacity-suggestions">
              {(payload?.suggestions ?? []).length ? payload!.suggestions.map((suggestion) => <article key={suggestion.key} className={suggestion.escalated || suggestion.dueSoon ? "urgent" : ""}>
                <div className="capacity-badges"><span>{suggestion.kind === "alert" ? "Alerta" : "Pendência"}</span><b>{priorityLabel[suggestion.priority]}</b>{suggestion.escalated ? <i>Escalonado</i> : suggestion.dueSoon ? <i>Perto do SLA</i> : null}</div>
                <strong>{suggestion.itemTitle}</strong>
                <div className="capacity-route"><span>{suggestion.fromName}</span><b>→</b><span>{suggestion.toName}</span></div>
                <p>{suggestion.reason}</p>
                <small>Peso operacional: {suggestion.weight} ponto(s)</small>
                <button type="button" onClick={() => void applySuggestion(suggestion)} disabled={savingKey === suggestion.key}>{savingKey === suggestion.key ? "Redistribuindo…" : "Aplicar sugestão"}</button>
              </article>) : <div className="capacity-empty"><strong>Nenhuma redistribuição sugerida.</strong><p>A carga atual não apresenta desequilíbrio que justifique uma troca assistida.</p></div>}
            </div>
          </section>

          <section className="treasury-capacity-card work-card">
            <header><div><small>CONTROLE MANUAL</small><h3>Itens em carga</h3></div><strong>{visibleItems.length}</strong></header>
            <div className="capacity-filters">
              <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Pessoa selecionada</button>
              <button type="button" className={filter === "overloaded" ? "active" : ""} onClick={() => setFilter("overloaded")}>Sobrecarregados</button>
              <button type="button" className={filter === "unassigned" ? "active" : ""} onClick={() => setFilter("unassigned")}>Sem responsável</button>
              <button type="button" className={filter === "urgent" ? "active" : ""} onClick={() => setFilter("urgent")}>Urgentes</button>
            </div>
            <div className="capacity-work-list">
              {visibleItems.length ? visibleItems.map((item) => {
                const targetValue = pendingTargets[item.key] ?? String(item.ownerUserId ?? "");
                return <article key={item.key} className={item.escalated || item.dueSoon ? "urgent" : ""}>
                  <div className="capacity-work-main">
                    <div className="capacity-badges"><span>{item.kind === "alert" ? "Alerta" : "Pendência"}</span><b>{priorityLabel[item.priority]}</b>{item.escalated ? <i>Escalonado</i> : item.dueSoon ? <i>SLA próximo</i> : null}</div>
                    <strong>{item.title}</strong><small>{item.accountName} · {item.ownerName ?? "Sem responsável"} · peso {item.weight}</small>
                    <p>{item.detail}</p>
                    <small>{statusLabel[item.status] ?? item.status}{item.slaRemainingMinutes !== null ? ` · ${item.slaRemainingMinutes < 0 ? "SLA vencido há" : "SLA em"} ${minutesLabel(item.slaRemainingMinutes)}` : ""}</small>
                  </div>
                  <div className="capacity-manual-controls">
                    <select value={targetValue} onChange={(event) => setPendingTargets((current) => ({ ...current, [item.key]: event.target.value }))}>
                      <option value="">Sem responsável</option>
                      {(payload?.people ?? []).map((person) => <option key={person.id} value={person.id}>{person.name} · {person.points} pts · {stateLabel[person.state]}</option>)}
                    </select>
                    <button type="button" disabled={savingKey === item.key || targetValue === String(item.ownerUserId ?? "")} onClick={() => void assign(item.kind, item.id, targetValue ? Number(targetValue) : null, item.key, "Responsável atualizado.")}>{savingKey === item.key ? "Salvando…" : "Mover"}</button>
                  </div>
                </article>;
              }) : <div className="capacity-empty"><strong>Nenhum item neste filtro.</strong><p>Selecione outra pessoa ou outro recorte de carga.</p></div>}
            </div>
          </section>
        </div>

        <footer className="treasury-capacity-footer">
          <span><b>Alertas:</b> {payload?.methodology.alertWeights}</span>
          <span><b>Pendências:</b> {payload?.methodology.taskWeights}</span>
          <span>{payload?.methodology.note}</span>
        </footer>
      </section>
    </div> : null}
  </>;
}
