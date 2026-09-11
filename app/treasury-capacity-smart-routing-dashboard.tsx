"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Confidence = "high" | "medium";
type FeedbackReason = "competence" | "availability" | "workload" | "coverage" | "context" | "other";
type Candidate = {
  userId: number;
  name: string;
  email: string;
  role: string;
  availability: "available" | "limited" | "unavailable";
  skillLevel: number;
  skillSummary: string;
  loadPoints: number;
  explicitCoverage: boolean;
  baseScore: number;
  score: number;
  autoEligible: boolean;
  reason: string;
  feedbackAdjustment: number;
  feedbackPositive: number;
  feedbackNegative: number;
  feedbackExplanation: string | null;
  feedbackBlockedAuto: boolean;
};
type Suggestion = Candidate & { confidence: Confidence };
type Item = {
  occurrenceId: number;
  title: string;
  detail: string;
  severity: "critical" | "high" | "medium";
  alertType: string;
  riskDate: string;
  domain: string | null;
  preparationDueAt: string | null;
  preparationEscalatedAt: string | null;
  assignedUserId: number | null;
  assignedName: string | null;
  assignedEmail: string | null;
  assignmentSource: string | null;
  suggestion: Suggestion | null;
  alternatives: Candidate[];
};
type FeedbackRow = {
  id: number;
  occurrenceId: number;
  userId: number;
  candidateName: string;
  candidateEmail: string;
  alertType: string;
  domain: string | null;
  feedback: "positive" | "negative";
  reasonCode: FeedbackReason;
  note: string | null;
  candidateScore: number | null;
  performedBy: string;
  createdAt: string;
  updatedAt: string;
};
type Payload = {
  generatedAt: string;
  settings: {
    autoAssignmentEnabled: boolean;
    minimumSkillLevel: number;
    feedbackLearningEnabled: boolean;
  };
  items: Item[];
  autoAssigned: number;
  feedbackHistory: FeedbackRow[];
  summary: {
    activeUnprepared: number;
    assigned: number;
    unassigned: number;
    highConfidence: number;
    mediumConfidence: number;
    noEligibleCandidate: number;
    autoAssigned: number;
    feedbackTotal: number;
    feedbackPositive: number;
    feedbackNegative: number;
  };
};

const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const severityLabel = { critical: "Crítico", high: "Alto", medium: "Médio" } as const;
const availabilityLabel = { available: "Disponível", limited: "Limitado", unavailable: "Indisponível" } as const;
const feedbackReasonLabel: Record<FeedbackReason, string> = {
  competence: "Competência",
  availability: "Disponibilidade",
  workload: "Carga",
  coverage: "Cobertura programada",
  context: "Contexto do risco",
  other: "Outro",
};

export function TreasuryCapacitySmartRoutingDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [message, setMessage] = useState("");
  const [autoAssignmentEnabled, setAutoAssignmentEnabled] = useState(false);
  const [minimumSkillLevel, setMinimumSkillLevel] = useState(2);
  const [feedbackLearningEnabled, setFeedbackLearningEnabled] = useState(true);
  const [filter, setFilter] = useState<"all" | "unassigned" | "high" | "no_fit">("all");
  const [showFeedbackHistory, setShowFeedbackHistory] = useState(false);
  const [feedbackReasons, setFeedbackReasons] = useState<Record<number, FeedbackReason>>({});

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
      const response = await fetch("/api/treasury-capacity-alert-routing", { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) {
        if (!silent) setMessage(result.error ?? "Não foi possível calcular o roteamento preventivo.");
        return;
      }
      setPayload(result);
      setAuthorized(true);
      setAutoAssignmentEnabled(Boolean(result.settings.autoAssignmentEnabled));
      setMinimumSkillLevel(Number(result.settings.minimumSkillLevel));
      setFeedbackLearningEnabled(Boolean(result.settings.feedbackLearningEnabled));
      if (result.autoAssigned > 0 && !silent) setMessage(`${result.autoAssigned} preventivo(s) atribuído(s) automaticamente nesta sincronização.`);
      else if (!silent) setMessage("");
    } catch {
      if (!silent) setMessage("Não foi possível calcular o roteamento preventivo.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { if (target && authorized === null) void refresh(true); }, [target, authorized]);
  useEffect(() => { if (open) void refresh(); }, [open]);
  useEffect(() => {
    if (!target || authorized === false) return;
    const timer = window.setInterval(() => void refresh(true), 60000);
    return () => window.clearInterval(timer);
  }, [target, authorized]);

  const items = useMemo(() => (payload?.items ?? []).filter((item) => {
    if (filter === "all") return true;
    if (filter === "unassigned") return !item.assignedUserId;
    if (filter === "high") return !item.assignedUserId && item.suggestion?.confidence === "high";
    return !item.assignedUserId && !item.suggestion;
  }), [payload, filter]);

  async function applySuggestion(item: Item) {
    if (!item.suggestion) return;
    const key = `apply-${item.occurrenceId}`;
    setSavingKey(key);
    try {
      const response = await fetch("/api/treasury-capacity-alert-routing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_suggestion", occurrenceId: item.occurrenceId }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; suggestion?: Suggestion };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível aplicar a sugestão.");
        return;
      }
      setMessage(`${result.suggestion?.name ?? "Responsável"} definido para preparar o preventivo.`);
      await refresh(true);
    } finally {
      setSavingKey(null);
    }
  }

  async function sendFeedback(item: Item, feedback: "positive" | "negative") {
    if (!item.suggestion) return;
    const reasonCode = feedbackReasons[item.occurrenceId] ?? "competence";
    const note = window.prompt(
      feedback === "positive"
        ? `Observação opcional sobre a boa sugestão “${item.suggestion.name}”:`
        : `Explique opcionalmente por que “${item.suggestion.name}” não é a pessoa adequada:`,
      "",
    );
    if (note === null) return;
    const key = `feedback-${item.occurrenceId}`;
    setSavingKey(key);
    try {
      const response = await fetch("/api/treasury-capacity-alert-routing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "feedback",
          occurrenceId: item.occurrenceId,
          userId: item.suggestion.userId,
          feedback,
          reasonCode,
          note: note.trim(),
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível registrar o feedback.");
        return;
      }
      setMessage(feedback === "positive"
        ? "Feedback positivo registrado. O histórico poderá favorecer sugestões semelhantes de forma limitada."
        : "Feedback negativo registrado. O histórico poderá reduzir a prioridade de sugestões semelhantes de forma limitada.");
      await refresh(true);
    } finally {
      setSavingKey(null);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const response = await fetch("/api/treasury-capacity-alert-routing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", autoAssignmentEnabled, minimumSkillLevel, feedbackLearningEnabled }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível salvar o roteamento preventivo.");
        return;
      }
      setMessage(`${autoAssignmentEnabled ? "Autoatribuição ativada" : "Autoatribuição desativada"}. Aprendizado por feedback ${feedbackLearningEnabled ? "ativado" : "desativado"}.`);
      await refresh(true);
    } finally {
      setSavingSettings(false);
    }
  }

  function openPreventives() {
    setOpen(false);
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(".treasury-capacity-alerts-trigger")?.click(), 0);
  }

  if (!target || authorized === false) return null;
  const summary = payload?.summary;
  const tone = summary?.noEligibleCandidate ? "danger" : summary?.unassigned ? "warning" : "clear";

  return <>
    {createPortal(
      <button type="button" className={`treasury-smart-routing-trigger ${tone}`} onClick={() => setOpen(true)} disabled={authorized === null}>
        <span>ROTEAMENTO</span>
        <strong>{summary?.unassigned ?? "—"}</strong>
        <small>{summary?.highConfidence ? `${summary.highConfidence} sugestão(ões) forte(s)` : summary?.unassigned ? "preventivos aguardando responsável" : "fila preventiva distribuída"}</small>
      </button>,
      target,
    )}

    {open ? <div className="treasury-smart-routing-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-smart-routing-dashboard" role="dialog" aria-modal="true" aria-label="Roteamento preventivo inteligente da Tesouraria">
        <header className="smart-routing-header">
          <div>
            <small>TESOURARIA · ROTEAMENTO PREVENTIVO</small>
            <h2>Quem deve preparar cada risco</h2>
            <p>Recomendação explicável baseada em competência, disponibilidade, cobertura, carga e feedback auditável. Atribuições manuais existentes nunca são substituídas.</p>
          </div>
          <div className="smart-routing-actions">
            <button type="button" onClick={() => setShowFeedbackHistory((value) => !value)}>Feedback</button>
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
            <button type="button" onClick={openPreventives}>Abrir Preventivos</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="smart-routing-message">{message}</div> : null}

        <div className="smart-routing-kpis">
          <article><span>Preventivos</span><strong>{summary?.activeUnprepared ?? 0}</strong><small>ativos ainda não preparados</small></article>
          <article className={summary?.unassigned ? "warning" : "good"}><span>Sem responsável</span><strong>{summary?.unassigned ?? 0}</strong><small>{summary?.assigned ?? 0} já atribuídos</small></article>
          <article className={summary?.highConfidence ? "good" : ""}><span>Alta confiança</span><strong>{summary?.highConfidence ?? 0}</strong><small>aptos à autoatribuição</small></article>
          <article><span>Moderados</span><strong>{summary?.mediumConfidence ?? 0}</strong><small>exigem decisão humana</small></article>
          <article className={summary?.noEligibleCandidate ? "danger" : "good"}><span>Sem candidato</span><strong>{summary?.noEligibleCandidate ?? 0}</strong><small>requer ajuste de competência/escala</small></article>
          <article><span>Feedbacks</span><strong>{summary?.feedbackTotal ?? 0}</strong><small>{summary?.feedbackPositive ?? 0} positivos · {summary?.feedbackNegative ?? 0} negativos</small></article>
        </div>

        <section className="smart-routing-settings">
          <div className="settings-copy">
            <small>POLÍTICA</small>
            <strong>Automação e aprendizado</strong>
            <p>Autoatribuição exige alta confiança. O feedback altera o ranking de forma pequena, limitada e com menor peso conforme envelhece.</p>
          </div>
          <label className="smart-routing-toggle"><input type="checkbox" checked={autoAssignmentEnabled} onChange={(event) => setAutoAssignmentEnabled(event.target.checked)} /><span>Autoatribuição {autoAssignmentEnabled ? "ativada" : "desativada"}</span></label>
          <label className="smart-routing-toggle"><input type="checkbox" checked={feedbackLearningEnabled} onChange={(event) => setFeedbackLearningEnabled(event.target.checked)} /><span>Aprendizado {feedbackLearningEnabled ? "ativado" : "desativado"}</span></label>
          <label><span>Nível mínimo</span><select value={minimumSkillLevel} onChange={(event) => setMinimumSkillLevel(Number(event.target.value))}><option value={1}>1 · Apoio</option><option value={2}>2 · Habilitado</option><option value={3}>3 · Especialista</option></select></label>
          <button type="button" onClick={() => void saveSettings()} disabled={savingSettings}>{savingSettings ? "Salvando…" : "Salvar política"}</button>
        </section>

        <div className="smart-routing-toolbar">
          <div><button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos</button><button type="button" className={filter === "unassigned" ? "active" : ""} onClick={() => setFilter("unassigned")}>Sem responsável</button><button type="button" className={filter === "high" ? "active" : ""} onClick={() => setFilter("high")}>Alta confiança</button><button type="button" className={filter === "no_fit" ? "active" : ""} onClick={() => setFilter("no_fit")}>Sem candidato</button></div>
          <small>Sincronização automática a cada 60 segundos enquanto o TDK Manager estiver aberto.</small>
        </div>

        <section className="smart-routing-list">
          {items.length ? items.map((item) => <article key={item.occurrenceId} className={`${item.severity}${item.preparationEscalatedAt ? " overdue" : ""}`}>
            <div className="routing-risk">
              <div className="routing-badges"><b>{severityLabel[item.severity]}</b><span>Risco {dateLabel(item.riskDate)}</span>{item.preparationEscalatedAt ? <i>Preparação atrasada</i> : null}</div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <small>Prazo de preparação: {dateTime(item.preparationDueAt)}</small>
              {item.assignedUserId ? <div className="routing-current"><b>Responsável atual</b><span>{item.assignedName}</span><small>{item.assignedEmail} · {item.assignmentSource ?? "manual"}</small></div> : null}
            </div>

            <div className="routing-suggestion">
              {item.suggestion ? <>
                <div className="suggestion-title"><span>SUGESTÃO</span><b className={item.suggestion.confidence}>{item.suggestion.confidence === "high" ? "Alta confiança" : "Confiança moderada"}</b></div>
                <strong>{item.suggestion.name}</strong>
                <small>{item.suggestion.email}</small>
                <p>{item.suggestion.reason}</p>
                <div className="suggestion-metrics"><span>{availabilityLabel[item.suggestion.availability]}</span><span>{item.suggestion.skillSummary}</span><span>Carga {item.suggestion.loadPoints.toFixed(1)}</span><span>Score {item.suggestion.score.toFixed(2)}</span></div>
                {item.suggestion.feedbackExplanation ? <div className={`routing-learning ${item.suggestion.feedbackAdjustment <= 0 ? "positive" : "negative"}`}><b>Aprendizado:</b> {item.suggestion.feedbackExplanation}{item.suggestion.feedbackBlockedAuto ? <strong> · autoatribuição bloqueada por feedback recente de competência/contexto</strong> : null}</div> : null}
                {!item.assignedUserId ? <button type="button" className="primary" onClick={() => void applySuggestion(item)} disabled={savingKey === `apply-${item.occurrenceId}`}>{savingKey === `apply-${item.occurrenceId}` ? "Aplicando…" : "Aplicar sugestão"}</button> : <em>Atribuição existente preservada</em>}
                <div className="routing-feedback">
                  <label><span>Motivo do feedback</span><select value={feedbackReasons[item.occurrenceId] ?? "competence"} onChange={(event) => setFeedbackReasons((current) => ({ ...current, [item.occurrenceId]: event.target.value as FeedbackReason }))}><option value="competence">Competência</option><option value="availability">Disponibilidade</option><option value="workload">Carga</option><option value="coverage">Cobertura programada</option><option value="context">Contexto do risco</option><option value="other">Outro</option></select></label>
                  <div><button type="button" className="feedback-good" onClick={() => void sendFeedback(item, "positive")} disabled={savingKey === `feedback-${item.occurrenceId}`}>Boa sugestão</button><button type="button" className="feedback-bad" onClick={() => void sendFeedback(item, "negative")} disabled={savingKey === `feedback-${item.occurrenceId}`}>Não é a pessoa adequada</button></div>
                </div>
              </> : <div className="routing-no-fit"><strong>Nenhum candidato elegível</strong><p>Revise competências, escalas ou disponibilidade antes de atribuir este preventivo.</p></div>}
            </div>

            <div className="routing-alternatives">
              <span>ALTERNATIVAS</span>
              {item.alternatives.length ? item.alternatives.map((candidate) => <div key={candidate.userId}><strong>{candidate.name}</strong><small>{candidate.skillSummary} · carga {candidate.loadPoints.toFixed(1)} · score {candidate.score.toFixed(2)}</small>{candidate.feedbackExplanation ? <em>{candidate.feedbackExplanation}</em> : null}</div>) : <small>Sem alternativas adicionais.</small>}
            </div>
          </article>) : <div className="smart-routing-empty"><strong>Nada neste filtro.</strong><p>Quando houver preventivos não preparados, as sugestões aparecerão aqui.</p></div>}
        </section>

        {showFeedbackHistory ? <section className="smart-routing-feedback-history">
          <header><div><small>HISTÓRICO AUDITÁVEL</small><h3>Feedback das recomendações</h3></div><strong>{payload?.feedbackHistory.length ?? 0} recente(s)</strong></header>
          <div>
            {(payload?.feedbackHistory ?? []).length ? (payload?.feedbackHistory ?? []).map((row) => <article key={row.id} className={row.feedback}>
              <div><b>{row.feedback === "positive" ? "Boa sugestão" : "Não adequada"}</b><strong>{row.candidateName}</strong><span>{feedbackReasonLabel[row.reasonCode] ?? row.reasonCode}</span></div>
              <p>{row.note || "Sem observação adicional."}</p>
              <small>{row.performedBy} · {dateTime(row.createdAt)} · ocorrência #{row.occurrenceId}{row.domain ? ` · ${row.domain}` : ` · ${row.alertType}`}</small>
            </article>) : <div className="smart-routing-empty"><strong>Nenhum feedback registrado.</strong><p>As avaliações das sugestões aparecerão aqui.</p></div>}
          </div>
        </section> : null}

        <footer className="smart-routing-footer">O score apenas ordena candidatos e não representa desempenho. O aprendizado usa feedback do mesmo contexto, com efeito limitado entre -1,20 e +2,00 pontos e peso decrescente com o tempo. Feedback negativo recente por competência/contexto impede somente autoatribuição; a decisão manual continua disponível.</footer>
      </section>
    </div> : null}
  </>;
}
