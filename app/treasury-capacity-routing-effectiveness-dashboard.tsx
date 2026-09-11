"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type GroupMetrics = {
  group: "smart" | "manual";
  assigned: number;
  reassigned: number;
  reassignmentRatePct: number | null;
  retained: number;
  retentionRatePct: number | null;
  prepared: number;
  preparationRatePct: number | null;
  slaEligible: number;
  slaOnTime: number;
  slaCompliancePct: number | null;
  avgAssignmentToPreparationMinutes: number | null;
  currentOverdue: number;
};

type Payload = {
  generatedAt: string;
  horizon: number | "all";
  summary: {
    occurrences: number;
    assigned: number;
    unassigned: number;
    smartAssigned: number;
    manualAssigned: number;
    smartAuto: number;
    smartSuggestion: number;
    feedbackEvaluations: number;
    feedbackPositive: number;
    feedbackNegative: number;
    feedbackAcceptancePct: number | null;
    smartReassignmentRatePct: number | null;
    manualReassignmentRatePct: number | null;
    smartSlaCompliancePct: number | null;
    manualSlaCompliancePct: number | null;
  };
  comparison: { smart: GroupMetrics; manual: GroupMetrics };
  rejectionReasons: Array<{ reasonCode: string; count: number; sharePct: number | null }>;
  byContext: Array<{
    key: string;
    label: string;
    occurrences: number;
    smart: number;
    manual: number;
    reassigned: number;
    prepared: number;
    slaEligible: number;
    slaOnTime: number;
    positive: number;
    negative: number;
    smartSharePct: number | null;
    reassignmentRatePct: number | null;
    slaCompliancePct: number | null;
    feedbackAcceptancePct: number | null;
  }>;
  recentOccurrences: Array<{
    occurrenceId: number;
    title: string;
    riskDate: string;
    severity: string;
    context: string;
    assignmentGroup: "smart" | "manual" | "unassigned";
    assignmentSource: string | null;
    firstAssignedName: string | null;
    reassigned: boolean;
    preparedAt: string | null;
    preparationDueAt: string | null;
    slaResult: "on_time" | "late" | "overdue" | "open";
  }>;
};

const reasonLabels: Record<string, string> = {
  competence: "Competência",
  availability: "Disponibilidade",
  workload: "Carga",
  coverage: "Cobertura programada",
  context: "Contexto do risco",
  other: "Outro",
};

function pct(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / 1440).toFixed(1)} d`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

function sourceLabel(source: string | null) {
  if (source === "smart_auto") return "Inteligente automático";
  if (source === "smart_suggestion") return "Sugestão aplicada";
  if (source === "take") return "Assumido manualmente";
  if (source === "manual") return "Manual";
  return source ?? "Sem atribuição";
}

export function TreasuryCapacityRoutingEffectivenessDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [horizon, setHorizon] = useState<"30" | "90" | "180" | "all">("90");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [detailFilter, setDetailFilter] = useState<"all" | "smart" | "manual" | "reassigned" | "sla_problem">("all");

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
      const response = await fetch(`/api/treasury-capacity-routing-effectiveness?horizon=${horizon}`, { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) {
        if (!silent) setMessage(result.error ?? "Não foi possível calcular a eficácia do roteamento.");
        return;
      }
      setAuthorized(true);
      setPayload(result);
      if (!silent) setMessage("");
    } catch {
      if (!silent) setMessage("Não foi possível calcular a eficácia do roteamento.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { if (target && authorized === null) void refresh(true); }, [target, authorized]);
  useEffect(() => { if (open) void refresh(); }, [open, horizon]);

  const details = useMemo(() => (payload?.recentOccurrences ?? []).filter((row) => {
    if (detailFilter === "all") return true;
    if (detailFilter === "smart") return row.assignmentGroup === "smart";
    if (detailFilter === "manual") return row.assignmentGroup === "manual";
    if (detailFilter === "reassigned") return row.reassigned;
    return row.slaResult === "late" || row.slaResult === "overdue";
  }), [payload, detailFilter]);

  if (!target || authorized === false) return null;
  const summary = payload?.summary;
  const smart = payload?.comparison.smart;
  const manual = payload?.comparison.manual;
  const tone = summary?.smartSlaCompliancePct !== null && summary?.manualSlaCompliancePct !== null
    && (summary?.smartSlaCompliancePct ?? 0) >= (summary?.manualSlaCompliancePct ?? 0)
    ? "good" : summary?.occurrences ? "neutral" : "clear";

  return <>
    {createPortal(
      <button type="button" className={`treasury-routing-effectiveness-trigger ${tone}`} onClick={() => setOpen(true)} disabled={authorized === null}>
        <span>EFICÁCIA</span>
        <strong>{summary?.feedbackAcceptancePct !== null && summary?.feedbackAcceptancePct !== undefined ? `${Math.round(summary.feedbackAcceptancePct)}%` : "—"}</strong>
        <small>{summary?.feedbackEvaluations ? `${summary.feedbackEvaluations} avaliação(ões) do roteamento` : "medir qualidade do roteamento"}</small>
      </button>,
      target,
    )}

    {open ? <div className="treasury-routing-effectiveness-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-routing-effectiveness-dashboard" role="dialog" aria-modal="true" aria-label="Eficácia do roteamento preventivo">
        <header className="routing-effectiveness-header">
          <div>
            <small>TESOURARIA · QUALIDADE DO ROTEAMENTO</small>
            <h2>Eficácia do roteamento preventivo</h2>
            <p>Compara a origem da primeira atribuição e mede reatribuição, preparação, SLA e feedback explícito sem transformar o resultado em uma nota única.</p>
          </div>
          <div className="routing-effectiveness-actions">
            <select value={horizon} onChange={(event) => setHorizon(event.target.value as typeof horizon)}>
              <option value="30">30 dias</option><option value="90">90 dias</option><option value="180">180 dias</option><option value="all">Todo histórico</option>
            </select>
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="routing-effectiveness-message">{message}</div> : null}

        <div className="routing-effectiveness-kpis">
          <article><span>Ocorrências</span><strong>{summary?.occurrences ?? 0}</strong><small>detectadas no período</small></article>
          <article><span>Atribuição inteligente</span><strong>{summary?.smartAssigned ?? 0}</strong><small>{summary?.smartAuto ?? 0} automáticas · {summary?.smartSuggestion ?? 0} aplicadas</small></article>
          <article><span>Aceitação avaliada</span><strong>{pct(summary?.feedbackAcceptancePct ?? null)}</strong><small>{summary?.feedbackPositive ?? 0} positivas · {summary?.feedbackNegative ?? 0} negativas</small></article>
          <article className={(summary?.smartReassignmentRatePct ?? 0) > (summary?.manualReassignmentRatePct ?? 0) ? "warning" : "good"}><span>Reatribuição inteligente</span><strong>{pct(summary?.smartReassignmentRatePct ?? null)}</strong><small>manual: {pct(summary?.manualReassignmentRatePct ?? null)}</small></article>
          <article className={(summary?.smartSlaCompliancePct ?? 0) >= (summary?.manualSlaCompliancePct ?? 0) ? "good" : "warning"}><span>SLA inteligente</span><strong>{pct(summary?.smartSlaCompliancePct ?? null)}</strong><small>manual: {pct(summary?.manualSlaCompliancePct ?? null)}</small></article>
        </div>

        <section className="routing-effectiveness-comparison">
          <header><div><small>COMPARAÇÃO</small><h3>Inteligente × Manual</h3></div><p>A origem é definida pela primeira atribuição da ocorrência.</p></header>
          <div className="comparison-grid">
            {[{ label: "Roteamento inteligente", data: smart, kind: "smart" }, { label: "Escolha manual", data: manual, kind: "manual" }].map((entry) => <article key={entry.kind} className={entry.kind}>
              <h4>{entry.label}</h4>
              <dl>
                <div><dt>Atribuídas</dt><dd>{entry.data?.assigned ?? 0}</dd></div>
                <div><dt>Reatribuídas</dt><dd>{entry.data?.reassigned ?? 0} · {pct(entry.data?.reassignmentRatePct ?? null)}</dd></div>
                <div><dt>Retidas no responsável inicial</dt><dd>{pct(entry.data?.retentionRatePct ?? null)}</dd></div>
                <div><dt>Preparadas</dt><dd>{entry.data?.prepared ?? 0} · {pct(entry.data?.preparationRatePct ?? null)}</dd></div>
                <div><dt>SLA cumprido</dt><dd>{entry.data?.slaOnTime ?? 0}/{entry.data?.slaEligible ?? 0} · {pct(entry.data?.slaCompliancePct ?? null)}</dd></div>
                <div><dt>Tempo médio até preparar</dt><dd>{duration(entry.data?.avgAssignmentToPreparationMinutes ?? null)}</dd></div>
                <div><dt>Atrasadas agora</dt><dd>{entry.data?.currentOverdue ?? 0}</dd></div>
              </dl>
            </article>)}
          </div>
        </section>

        <div className="routing-effectiveness-columns">
          <section className="routing-effectiveness-card">
            <header><small>FEEDBACK NEGATIVO</small><h3>Principais motivos de rejeição</h3></header>
            <div className="reason-list">
              {(payload?.rejectionReasons ?? []).length ? payload!.rejectionReasons.map((row) => <div key={row.reasonCode}><span>{reasonLabels[row.reasonCode] ?? row.reasonCode}</span><strong>{row.count}</strong><small>{pct(row.sharePct)}</small></div>) : <p>Nenhum feedback negativo no período.</p>}
            </div>
          </section>

          <section className="routing-effectiveness-card context-card">
            <header><small>POR CONTEXTO</small><h3>Onde o roteamento funciona melhor</h3></header>
            <div className="context-table"><table><thead><tr><th>Contexto</th><th>Ocorr.</th><th>Smart</th><th>Reatrib.</th><th>SLA</th><th>Aceitação</th></tr></thead><tbody>
              {(payload?.byContext ?? []).map((row) => <tr key={row.key}><td>{row.label}</td><td>{row.occurrences}</td><td>{pct(row.smartSharePct)}</td><td>{pct(row.reassignmentRatePct)}</td><td>{pct(row.slaCompliancePct)}</td><td>{pct(row.feedbackAcceptancePct)}</td></tr>)}
            </tbody></table></div>
          </section>
        </div>

        <section className="routing-effectiveness-detail">
          <header><div><small>AMOSTRA RECENTE</small><h3>Ocorrências e resultado</h3></div><div className="effectiveness-filters">
            <button className={detailFilter === "all" ? "active" : ""} onClick={() => setDetailFilter("all")}>Todas</button>
            <button className={detailFilter === "smart" ? "active" : ""} onClick={() => setDetailFilter("smart")}>Inteligentes</button>
            <button className={detailFilter === "manual" ? "active" : ""} onClick={() => setDetailFilter("manual")}>Manuais</button>
            <button className={detailFilter === "reassigned" ? "active" : ""} onClick={() => setDetailFilter("reassigned")}>Reatribuídas</button>
            <button className={detailFilter === "sla_problem" ? "active" : ""} onClick={() => setDetailFilter("sla_problem")}>Problema de SLA</button>
          </div></header>
          <div className="effectiveness-detail-list">
            {details.length ? details.map((row) => <article key={row.occurrenceId}>
              <div><b>{row.assignmentGroup === "smart" ? "INTELIGENTE" : row.assignmentGroup === "manual" ? "MANUAL" : "SEM ATRIBUIÇÃO"}</b><span>Risco {dateLabel(row.riskDate)}</span></div>
              <main><strong>{row.title}</strong><small>{row.context} · {sourceLabel(row.assignmentSource)}{row.firstAssignedName ? ` · ${row.firstAssignedName}` : ""}</small></main>
              <div className="detail-status">{row.reassigned ? <i className="warning">Reatribuída</i> : <i>Sem troca</i>}<i className={row.slaResult === "on_time" ? "good" : row.slaResult === "late" || row.slaResult === "overdue" ? "danger" : ""}>{row.slaResult === "on_time" ? "SLA cumprido" : row.slaResult === "late" ? "Preparada atrasada" : row.slaResult === "overdue" ? "SLA vencido" : "Em aberto"}</i></div>
            </article>) : <div className="effectiveness-empty">Nenhuma ocorrência neste filtro.</div>}
          </div>
        </section>

        <footer className="routing-effectiveness-footer">Metodologia: o período é uma coorte pela primeira detecção da ocorrência. A taxa de aceitação considera somente sugestões que receberam feedback explícito. O SLA considera apenas preparações concluídas com prazo definido. Reatribuição indica troca de pessoa após a primeira atribuição.</footer>
      </section>
    </div> : null}
  </>;
}
