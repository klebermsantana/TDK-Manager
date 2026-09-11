"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Severity = "critical" | "high" | "medium";
type AlertType = "uncovered_skill" | "single_point" | "absence_without_coverage" | "low_capacity";
type UserRow = { id: number; name: string; email: string; role: string };
type ActiveAlert = {
  key: string;
  type: AlertType;
  severity: Severity;
  riskDate: string;
  domain: string | null;
  title: string;
  detail: string;
  action: string;
  occurrenceId: number;
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  acknowledgementNote: string | null;
  assignedUserId: number | null;
  assignedName: string | null;
  assignedEmail: string | null;
  assignedAt: string | null;
  assignmentSource: string | null;
  preparationDueAt: string | null;
  preparationRemainingMinutes: number | null;
  preparationEscalatedAt: string | null;
  preparedBy: string | null;
  preparedAt: string | null;
  preparationNote: string | null;
  daysUntilRisk: number;
};
type HistoryRow = {
  id: number;
  alertType: AlertType;
  severity: Severity;
  riskDate: string;
  title: string;
  status: string;
  firstSeenAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  assignedName: string | null;
  preparationDueAt: string | null;
  preparedBy: string | null;
  preparedAt: string | null;
  preparationEscalatedAt: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
};
type Settings = {
  lookaheadDays: 7 | 15 | 30;
  lowCapacityThresholdPct: number;
  preparationLeadBusinessDays: 1 | 2 | 3 | 5;
  uncoveredEnabled: boolean;
  singlePointEnabled: boolean;
  absenceWithoutCoverageEnabled: boolean;
  lowCapacityEnabled: boolean;
};
type Payload = {
  generatedAt: string;
  today: string;
  endDate: string;
  settings: Settings;
  currentUser: { id: number | null; email: string };
  users: UserRow[];
  active: ActiveAlert[];
  history: HistoryRow[];
  summary: {
    active: number;
    critical: number;
    high: number;
    medium: number;
    unacknowledged: number;
    unassigned: number;
    preparationOverdue: number;
    prepared: number;
    nearestRiskDays: number | null;
  };
};

const severityLabel: Record<Severity, string> = { critical: "Crítico", high: "Alto", medium: "Médio" };
const typeLabel: Record<AlertType, string> = {
  uncovered_skill: "Sem cobertura",
  single_point: "Ponto único",
  absence_without_coverage: "Ausência sem cobertura",
  low_capacity: "Capacidade reduzida",
};
const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
const dateTimeLabel = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

function durationLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(Math.round(value));
  if (abs < 60) return `${abs} min`;
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  if (hours < 48) return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function preparationText(row: ActiveAlert) {
  if (row.preparedAt) return `Preparado em ${dateTimeLabel(row.preparedAt)}`;
  if (row.preparationEscalatedAt) return `SLA de preparação vencido há ${durationLabel(row.preparationRemainingMinutes)}`;
  if (row.preparationRemainingMinutes === null) return "Prazo de preparação indisponível";
  return `Preparar em até ${durationLabel(row.preparationRemainingMinutes)}`;
}

export function TreasuryCapacityAlertsDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [lookaheadDays, setLookaheadDays] = useState<7 | 15 | 30>(7);
  const [threshold, setThreshold] = useState(70);
  const [preparationLeadBusinessDays, setPreparationLeadBusinessDays] = useState<1 | 2 | 3 | 5>(1);
  const [uncoveredEnabled, setUncoveredEnabled] = useState(true);
  const [singlePointEnabled, setSinglePointEnabled] = useState(true);
  const [absenceEnabled, setAbsenceEnabled] = useState(true);
  const [lowCapacityEnabled, setLowCapacityEnabled] = useState(true);

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
      const response = await fetch("/api/treasury-capacity-alerts", { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) {
        if (!silent) setMessage(result.error ?? "Não foi possível carregar os alertas preventivos.");
        return;
      }
      setPayload(result);
      setAuthorized(true);
      setMessage("");
      setLookaheadDays(result.settings.lookaheadDays);
      setThreshold(Number(result.settings.lowCapacityThresholdPct));
      setPreparationLeadBusinessDays(result.settings.preparationLeadBusinessDays);
      setUncoveredEnabled(Boolean(result.settings.uncoveredEnabled));
      setSinglePointEnabled(Boolean(result.settings.singlePointEnabled));
      setAbsenceEnabled(Boolean(result.settings.absenceWithoutCoverageEnabled));
      setLowCapacityEnabled(Boolean(result.settings.lowCapacityEnabled));
    } catch {
      if (!silent) setMessage("Não foi possível carregar os alertas preventivos.");
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

  const active = useMemo(() => payload?.active ?? [], [payload]);

  async function patch(body: Record<string, unknown>, success: string, key: string) {
    setSavingId(key);
    try {
      const response = await fetch("/api/treasury-capacity-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível atualizar o alerta preventivo.");
        return false;
      }
      setMessage(success);
      await refresh(true);
      return true;
    } finally {
      setSavingId(null);
    }
  }

  async function acknowledge(row: ActiveAlert) {
    const note = window.prompt(`Observação opcional ao reconhecer “${row.title}”:`, "");
    if (note === null) return;
    await patch({ action: "acknowledge", occurrenceId: row.occurrenceId, note }, "Ciência preventiva registrada. O SLA de preparação continua correndo até a ação ser marcada como preparada.", `ack-${row.occurrenceId}`);
  }

  async function take(row: ActiveAlert) {
    await patch({ action: "take", occurrenceId: row.occurrenceId }, "Responsabilidade preventiva assumida.", `take-${row.occurrenceId}`);
  }

  async function assign(row: ActiveAlert, userId: string) {
    const value = userId ? Number(userId) : null;
    await patch({ action: "assign", occurrenceId: row.occurrenceId, userId: value }, value ? "Responsável preventivo atualizado." : "Responsável preventivo removido.", `assign-${row.occurrenceId}`);
  }

  async function prepare(row: ActiveAlert) {
    const note = window.prompt(`O que foi preparado para “${row.title}”?`, row.preparationNote ?? "");
    if (note === null) return;
    await patch({ action: "prepare", occurrenceId: row.occurrenceId, note }, "Preparação registrada. O risco continua monitorado até a condição deixar de existir.", `prepare-${row.occurrenceId}`);
  }

  async function saveSettings() {
    await patch({
      action: "settings",
      lookaheadDays,
      lowCapacityThresholdPct: threshold,
      preparationLeadBusinessDays,
      uncoveredEnabled,
      singlePointEnabled,
      absenceWithoutCoverageEnabled: absenceEnabled,
      lowCapacityEnabled,
    }, "Configuração preventiva atualizada.", "settings");
    setShowSettings(false);
  }

  function openModule(kind: "forecast" | "schedules" | "skills") {
    const selector = kind === "forecast" ? ".treasury-capacity-forecast-trigger" : kind === "schedules" ? ".treasury-schedules-trigger" : ".treasury-routing-trigger";
    document.querySelector<HTMLButtonElement>(selector)?.click();
  }

  function suggestedModule(row: ActiveAlert) {
    return row.type === "absence_without_coverage" ? "schedules" : row.type === "low_capacity" ? "forecast" : "skills";
  }

  if (!target || authorized === false) return null;
  const summary = payload?.summary;
  const tone = summary?.preparationOverdue || summary?.critical ? "danger" : summary?.high ? "warning" : "clear";

  return <>
    {createPortal(
      <button type="button" className={`treasury-capacity-alerts-trigger ${tone}`} onClick={() => setOpen(true)} disabled={authorized === null}>
        <span>PREVENTIVOS</span>
        <strong>{summary?.active ?? "—"}</strong>
        <small>{summary?.preparationOverdue ? `${summary.preparationOverdue} SLA(s) vencido(s)` : summary?.critical ? `${summary.critical} crítico(s)` : summary?.active ? `${summary.unassigned} sem responsável` : "sem risco futuro ativo"}</small>
      </button>,
      target,
    )}

    {open ? <div className="treasury-capacity-alerts-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-capacity-alerts-dashboard" role="dialog" aria-modal="true" aria-label="Alertas preventivos de capacidade da Tesouraria">
        <header className="treasury-capacity-alerts-header">
          <div><small>TESOURARIA · ALERTAS PREVENTIVOS</small><h2>Riscos futuros de cobertura</h2><p>Antecipe falta de competência, ponto único, ausência sem cobertura e queda de capacidade. Cada risco pode ter responsável e SLA próprio de preparação.</p></div>
          <div className="capacity-alerts-actions"><button type="button" onClick={() => setShowSettings((value) => !value)}>Configurar</button><button type="button" onClick={() => setShowHistory((value) => !value)}>Histórico</button><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button><button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button></div>
        </header>

        {message ? <div className="treasury-capacity-alerts-message">{message}</div> : null}

        <div className="treasury-capacity-alerts-kpis">
          <article><span>Ativos</span><strong>{summary?.active ?? 0}</strong><small>janela de {payload?.settings.lookaheadDays ?? lookaheadDays} dias</small></article>
          <article className={summary?.preparationOverdue ? "danger" : "good"}><span>SLA vencido</span><strong>{summary?.preparationOverdue ?? 0}</strong><small>preparação fora do prazo</small></article>
          <article className={summary?.unassigned ? "warning" : "good"}><span>Sem responsável</span><strong>{summary?.unassigned ?? 0}</strong><small>precisam de dono</small></article>
          <article><span>Preparados</span><strong>{summary?.prepared ?? 0}</strong><small>ação preventiva registrada</small></article>
          <article><span>Risco mais próximo</span><strong>{summary?.nearestRiskDays ?? "—"}</strong><small>{summary?.nearestRiskDays === null ? "sem risco ativo" : "dia(s)"}</small></article>
        </div>

        {showSettings ? <section className="capacity-alerts-settings">
          <header><div><small>REGRAS</small><h3>Monitoramento preventivo</h3></div></header>
          <div className="capacity-alerts-settings-grid">
            <label><span>Antecedência do monitoramento</span><select value={lookaheadDays} onChange={(event) => setLookaheadDays(Number(event.target.value) as 7 | 15 | 30)}><option value={7}>7 dias</option><option value={15}>15 dias</option><option value={30}>30 dias</option></select></label>
            <label><span>SLA de preparação</span><select value={preparationLeadBusinessDays} onChange={(event) => setPreparationLeadBusinessDays(Number(event.target.value) as 1 | 2 | 3 | 5)}><option value={1}>1 dia útil antes</option><option value={2}>2 dias úteis antes</option><option value={3}>3 dias úteis antes</option><option value={5}>5 dias úteis antes</option></select><small>Prazo até 17h do dia útil calculado. Feriados ainda não são descontados.</small></label>
            <label><span>Limite de capacidade</span><input type="number" min={30} max={100} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /><small>Gera alerta abaixo deste percentual.</small></label>
            <label className="toggle"><input type="checkbox" checked={uncoveredEnabled} onChange={(event) => setUncoveredEnabled(event.target.checked)} /><span>Competência sem cobertura</span></label>
            <label className="toggle"><input type="checkbox" checked={singlePointEnabled} onChange={(event) => setSinglePointEnabled(event.target.checked)} /><span>Ponto único de dependência</span></label>
            <label className="toggle"><input type="checkbox" checked={absenceEnabled} onChange={(event) => setAbsenceEnabled(event.target.checked)} /><span>Ausência sem cobertura</span></label>
            <label className="toggle"><input type="checkbox" checked={lowCapacityEnabled} onChange={(event) => setLowCapacityEnabled(event.target.checked)} /><span>Capacidade geral reduzida</span></label>
          </div>
          <div className="capacity-alerts-settings-footer"><p>Reconhecer não cumpre o SLA de preparação. A preparação precisa ser registrada separadamente.</p><button type="button" onClick={() => void saveSettings()} disabled={savingId === "settings"}>{savingId === "settings" ? "Salvando…" : "Salvar regras"}</button></div>
        </section> : null}

        <section className="capacity-alerts-card active-card">
          <header><div><small>ATIVOS</small><h3>Riscos a tratar antes da data</h3></div><strong>{active.length}</strong></header>
          <div className="capacity-alerts-list">
            {active.length ? active.map((row) => <article key={row.occurrenceId} className={`${row.severity}${row.preparationEscalatedAt && !row.preparedAt ? " prep-overdue" : ""}${row.preparedAt ? " prepared" : ""}`}>
              <div className="capacity-alerts-main">
                <div className="capacity-alerts-badges"><b>{severityLabel[row.severity]}</b><span>{typeLabel[row.type]}</span><i>{row.daysUntilRisk === 0 ? "Hoje" : `em ${row.daysUntilRisk} dia(s)`}</i>{row.preparationEscalatedAt && !row.preparedAt ? <em className="overdue">SLA vencido</em> : row.preparedAt ? <em>Preparado</em> : row.acknowledgedAt ? <em>Ciente</em> : <em className="pending">Sem ciência</em>}</div>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
                <small>Data do risco: {dateLabel(row.riskDate)} · Detectado: {dateTimeLabel(row.firstSeenAt)}</small>
                <div className={`capacity-alerts-preparation ${row.preparationEscalatedAt && !row.preparedAt ? "overdue" : row.preparedAt ? "prepared" : ""}`}><b>Preparação:</b> {preparationText(row)} · prazo {dateTimeLabel(row.preparationDueAt)}</div>
                <div className="capacity-alerts-owner"><b>Responsável:</b> {row.assignedName ? `${row.assignedName} · ${row.assignedEmail}` : "Não atribuído"}</div>
                <div className="capacity-alerts-recommendation"><b>Ação:</b> {row.action}</div>
              </div>
              <div className="capacity-alerts-controls">
                <label><span>Atribuir</span><select value={row.assignedUserId ? String(row.assignedUserId) : ""} onChange={(event) => void assign(row, event.target.value)} disabled={savingId === `assign-${row.occurrenceId}`}><option value="">Sem responsável</option>{(payload?.users ?? []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
                {!row.assignedUserId && payload?.currentUser.id ? <button type="button" onClick={() => void take(row)} disabled={savingId === `take-${row.occurrenceId}`}>Assumir</button> : null}
                {!row.acknowledgedAt ? <button type="button" onClick={() => void acknowledge(row)} disabled={savingId === `ack-${row.occurrenceId}`}>Reconhecer</button> : <small>Ciência: {row.acknowledgedBy}</small>}
                {!row.preparedAt ? <button type="button" className="prepare" onClick={() => void prepare(row)} disabled={savingId === `prepare-${row.occurrenceId}`}>{savingId === `prepare-${row.occurrenceId}` ? "Registrando…" : "Marcar preparado"}</button> : <small>Preparado por {row.preparedBy}</small>}
                <button type="button" className="primary" onClick={() => openModule(suggestedModule(row))}>Abrir origem</button>
                <button type="button" onClick={() => openModule("forecast")}>Ver previsão</button>
              </div>
            </article>) : <div className="capacity-alerts-empty"><strong>Nenhum risco preventivo ativo.</strong><p>A cobertura prevista está consistente na janela configurada.</p></div>}
          </div>
        </section>

        {showHistory ? <section className="capacity-alerts-card history-card">
          <header><div><small>HISTÓRICO</small><h3>Ocorrências preventivas</h3></div><strong>{payload?.history.length ?? 0}</strong></header>
          <div className="capacity-alerts-history">
            {(payload?.history ?? []).slice(0, 40).map((row) => <article key={row.id}>
              <div><b className={row.severity}>{severityLabel[row.severity]}</b><strong>{row.title}</strong><span>{dateLabel(row.riskDate)}</span>{row.preparationEscalatedAt ? <em>SLA rompido</em> : null}{row.preparedAt ? <em>Preparado</em> : null}</div>
              <small>Detectado {dateTimeLabel(row.firstSeenAt)}{row.assignedName ? ` · responsável ${row.assignedName}` : ""}{row.acknowledgedAt ? ` · ciência ${dateTimeLabel(row.acknowledgedAt)}` : ""}{row.preparedAt ? ` · preparado ${dateTimeLabel(row.preparedAt)}` : ""}{row.resolvedAt ? ` · encerrado ${dateTimeLabel(row.resolvedAt)}` : " · ativo"}</small>
              {row.resolutionReason ? <em>{row.resolutionReason === "condition_cleared" ? "Risco normalizado" : row.resolutionReason === "monitoring_disabled" ? "Monitoramento desativado" : row.resolutionReason === "outside_monitoring_window" ? "Fora da janela configurada" : "Data de risco transcorrida"}</em> : null}
            </article>)}
          </div>
        </section> : null}

        <footer className="treasury-capacity-alerts-footer">O SLA preventivo mede preparação, não resolução técnica. Reconhecer registra ciência; “Marcar preparado” registra que a ação preventiva foi organizada. O risco continua monitorado até a condição desaparecer, a regra ser desativada, a data passar ou sair da janela.</footer>
      </section>
    </div> : null}
  </>;
}
