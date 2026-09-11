"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Severity = "critical" | "high" | "medium";
type AlertType = "uncovered_skill" | "single_point" | "absence_without_coverage" | "low_capacity";
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
  resolvedAt: string | null;
  resolutionReason: string | null;
};
type Settings = {
  lookaheadDays: 7 | 15 | 30;
  lowCapacityThresholdPct: number;
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
  active: ActiveAlert[];
  history: HistoryRow[];
  summary: {
    active: number;
    critical: number;
    high: number;
    medium: number;
    unacknowledged: number;
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
const dateTimeLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export function TreasuryCapacityAlertsDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [lookaheadDays, setLookaheadDays] = useState<7 | 15 | 30>(7);
  const [threshold, setThreshold] = useState(70);
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

  async function acknowledge(row: ActiveAlert) {
    setSaving(true);
    try {
      const response = await fetch("/api/treasury-capacity-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge", occurrenceId: row.occurrenceId }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível reconhecer o alerta.");
        return;
      }
      setMessage("Risco preventivo reconhecido. Ele continuará ativo enquanto a condição existir.");
      await refresh(true);
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const response = await fetch("/api/treasury-capacity-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settings",
          lookaheadDays,
          lowCapacityThresholdPct: threshold,
          uncoveredEnabled,
          singlePointEnabled,
          absenceWithoutCoverageEnabled: absenceEnabled,
          lowCapacityEnabled,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível salvar a configuração preventiva.");
        return;
      }
      setMessage("Configuração preventiva atualizada.");
      setShowSettings(false);
      await refresh(true);
    } finally {
      setSaving(false);
    }
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
  const tone = summary?.critical ? "danger" : summary?.high ? "warning" : "clear";

  return <>
    {createPortal(
      <button type="button" className={`treasury-capacity-alerts-trigger ${tone}`} onClick={() => setOpen(true)} disabled={authorized === null}>
        <span>PREVENTIVOS</span>
        <strong>{summary?.active ?? "—"}</strong>
        <small>{summary?.critical ? `${summary.critical} crítico(s)` : summary?.active ? `${summary.unacknowledged} sem ciência` : "sem risco futuro ativo"}</small>
      </button>,
      target,
    )}

    {open ? <div className="treasury-capacity-alerts-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-capacity-alerts-dashboard" role="dialog" aria-modal="true" aria-label="Alertas preventivos de capacidade da Tesouraria">
        <header className="treasury-capacity-alerts-header">
          <div><small>TESOURARIA · ALERTAS PREVENTIVOS</small><h2>Riscos futuros de cobertura</h2><p>Antecipe falta de competência, ponto único, ausência sem cobertura e queda de capacidade antes da data crítica.</p></div>
          <div className="capacity-alerts-actions"><button type="button" onClick={() => setShowSettings((value) => !value)}>Configurar</button><button type="button" onClick={() => setShowHistory((value) => !value)}>Histórico</button><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button><button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button></div>
        </header>

        {message ? <div className="treasury-capacity-alerts-message">{message}</div> : null}

        <div className="treasury-capacity-alerts-kpis">
          <article><span>Ativos</span><strong>{summary?.active ?? 0}</strong><small>janela de {payload?.settings.lookaheadDays ?? lookaheadDays} dias</small></article>
          <article className={summary?.critical ? "danger" : "good"}><span>Críticos</span><strong>{summary?.critical ?? 0}</strong><small>competência descoberta / capacidade severa</small></article>
          <article className={summary?.high ? "warning" : "good"}><span>Altos</span><strong>{summary?.high ?? 0}</strong><small>ponto único / ausência sem cobertura</small></article>
          <article><span>Sem ciência</span><strong>{summary?.unacknowledged ?? 0}</strong><small>riscos ainda não reconhecidos</small></article>
          <article><span>Risco mais próximo</span><strong>{summary?.nearestRiskDays ?? "—"}</strong><small>{summary?.nearestRiskDays === null ? "sem risco ativo" : "dia(s)"}</small></article>
        </div>

        {showSettings ? <section className="capacity-alerts-settings">
          <header><div><small>REGRAS</small><h3>Monitoramento preventivo</h3></div></header>
          <div className="capacity-alerts-settings-grid">
            <label><span>Antecedência</span><select value={lookaheadDays} onChange={(event) => setLookaheadDays(Number(event.target.value) as 7 | 15 | 30)}><option value={7}>7 dias</option><option value={15}>15 dias</option><option value={30}>30 dias</option></select></label>
            <label><span>Limite de capacidade</span><input type="number" min={30} max={100} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /><small>Gera alerta abaixo deste percentual.</small></label>
            <label className="toggle"><input type="checkbox" checked={uncoveredEnabled} onChange={(event) => setUncoveredEnabled(event.target.checked)} /><span>Competência sem cobertura</span></label>
            <label className="toggle"><input type="checkbox" checked={singlePointEnabled} onChange={(event) => setSinglePointEnabled(event.target.checked)} /><span>Ponto único de dependência</span></label>
            <label className="toggle"><input type="checkbox" checked={absenceEnabled} onChange={(event) => setAbsenceEnabled(event.target.checked)} /><span>Ausência sem cobertura</span></label>
            <label className="toggle"><input type="checkbox" checked={lowCapacityEnabled} onChange={(event) => setLowCapacityEnabled(event.target.checked)} /><span>Capacidade geral reduzida</span></label>
          </div>
          <div className="capacity-alerts-settings-footer"><p>Reduzir a janela pode encerrar ocorrências como “fora da janela”, sem afirmar que o risco foi corrigido.</p><button type="button" onClick={() => void saveSettings()} disabled={saving}>{saving ? "Salvando…" : "Salvar regras"}</button></div>
        </section> : null}

        <section className="capacity-alerts-card active-card">
          <header><div><small>ATIVOS</small><h3>Riscos a tratar antes da data</h3></div><strong>{active.length}</strong></header>
          <div className="capacity-alerts-list">
            {active.length ? active.map((row) => <article key={row.occurrenceId} className={row.severity}>
              <div className="capacity-alerts-main">
                <div className="capacity-alerts-badges"><b>{severityLabel[row.severity]}</b><span>{typeLabel[row.type]}</span><i>{row.daysUntilRisk === 0 ? "Hoje" : `em ${row.daysUntilRisk} dia(s)`}</i>{row.acknowledgedAt ? <em>Reconhecido</em> : <em className="pending">Sem ciência</em>}</div>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
                <small>Data do risco: {dateLabel(row.riskDate)} · Detectado: {dateTimeLabel(row.firstSeenAt)}</small>
                <div className="capacity-alerts-recommendation"><b>Ação:</b> {row.action}</div>
              </div>
              <div className="capacity-alerts-controls">
                {!row.acknowledgedAt ? <button type="button" onClick={() => void acknowledge(row)} disabled={saving}>Reconhecer</button> : <small>{row.acknowledgedBy}</small>}
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
              <div><b className={row.severity}>{severityLabel[row.severity]}</b><strong>{row.title}</strong><span>{dateLabel(row.riskDate)}</span></div>
              <small>Detectado {dateTimeLabel(row.firstSeenAt)}{row.acknowledgedAt ? ` · ciência ${dateTimeLabel(row.acknowledgedAt)}` : ""}{row.resolvedAt ? ` · encerrado ${dateTimeLabel(row.resolvedAt)}` : " · ativo"}</small>
              {row.resolutionReason ? <em>{row.resolutionReason === "condition_cleared" ? "Risco normalizado" : row.resolutionReason === "monitoring_disabled" ? "Monitoramento desativado" : row.resolutionReason === "outside_monitoring_window" ? "Fora da janela configurada" : "Data de risco transcorrida"}</em> : null}
            </article>)}
          </div>
        </section> : null}

        <footer className="treasury-capacity-alerts-footer">Alertas preventivos usam a previsão de capacidade e não fazem movimentações nem redistribuições automaticamente. Reconhecer significa apenas registrar ciência; o alerta só encerra quando a condição some, a regra é desativada, a data passa ou sai da janela configurada.</footer>
      </section>
    </div> : null}
  </>;
}
