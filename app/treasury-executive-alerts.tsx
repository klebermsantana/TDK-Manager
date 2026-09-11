"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Alert = {
  key: string;
  type: "negative_forecast" | "critical_task" | "reconciliation" | "closing_overdue";
  severity: "critical" | "high" | "medium";
  title: string;
  detail: string;
  action: string;
  bankAccountId: number | null;
  accountName: string;
  amount: number;
  metric: number | null;
  occurrenceId: number;
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  acknowledgementNote: string | null;
};

type AlertOccurrence = {
  id: number;
  alertKey: string;
  alertType: Alert["type"];
  severity: Alert["severity"];
  title: string;
  detail: string;
  recommendedAction: string;
  bankAccountId: number | null;
  accountName: string;
  amount: number;
  metric: number | null;
  status: "active" | "resolved";
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  acknowledgementNote: string | null;
  resolvedAt: string | null;
  resolutionReason: "condition_cleared" | "monitoring_disabled" | null;
};

type Settings = {
  id: number;
  forecastHorizonDays: number;
  reconciliationMinPct: number;
  closingCadence: "daily" | "monthly";
  negativeForecastEnabled: boolean;
  criticalTasksEnabled: boolean;
  reconciliationEnabled: boolean;
  closingOverdueEnabled: boolean;
  updatedBy: string | null;
  updatedAt: string;
};

type Payload = {
  generatedAt: string;
  date: string;
  settings: Settings;
  alerts: Alert[];
  history: AlertOccurrence[];
  summary: {
    total: number;
    critical: number;
    high: number;
    acknowledged: number;
    unacknowledged: number;
    negativeForecast: number;
    criticalTasks: number;
    reconciliation: number;
    closingOverdue: number;
    historyCount: number;
    resolvedHistory: number;
  };
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const typeLabel = {
  negative_forecast: "Caixa projetado",
  critical_task: "Pendência crítica",
  reconciliation: "Conciliação",
  closing_overdue: "Fechamento",
} as const;
const severityLabel = { critical: "Crítico", high: "Alto", medium: "Médio" } as const;

function durationLabel(start: string, end?: string | null) {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const minutes = Math.max(0, Math.floor((endMs - startMs) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

export function TreasuryExecutiveAlerts() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [filter, setFilter] = useState<"all" | "critical" | "high">("all");
  const [historyFilter, setHistoryFilter] = useState<"all" | "active" | "resolved">("all");

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
      const response = await fetch("/api/treasury-executive-alerts", { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) {
        if (!silent) setMessage(result.error ?? "Não foi possível atualizar os alertas.");
        return;
      }
      setPayload(result);
      setSettings(result.settings);
      setAuthorized(true);
      setMessage("");
    } catch {
      if (!silent) setMessage("Não foi possível carregar os alertas executivos da Tesouraria.");
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

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await fetch("/api/treasury-executive-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, action: "settings" }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível salvar as regras de alerta.");
        return;
      }
      setMessage("Regras de alerta atualizadas.");
      await refresh(true);
    } finally {
      setSaving(false);
    }
  }

  async function acknowledge(alert: Alert) {
    const note = window.prompt(`Observação opcional ao reconhecer “${alert.title}”:`, "");
    if (note === null) return;
    setSaving(true);
    try {
      const response = await fetch("/api/treasury-executive-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge", occurrenceId: alert.occurrenceId, note: note.trim() }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível reconhecer o alerta.");
        await refresh(true);
        return;
      }
      setMessage("Ciência registrada. O alerta continua ativo até a causa ser normalizada.");
      await refresh(true);
    } finally {
      setSaving(false);
    }
  }

  function openSource(alert: Pick<Alert, "type">) {
    setOpen(false);
    window.setTimeout(() => {
      const selector = alert.type === "negative_forecast"
        ? ".treasury-trigger"
        : alert.type === "critical_task"
          ? ".treasury-tasks-trigger"
          : alert.type === "reconciliation"
            ? ".recon-trigger"
            : ".treasury-calendar-trigger";
      document.querySelector<HTMLButtonElement>(selector)?.click();
    }, 0);
  }

  const visibleAlerts = useMemo(() => (payload?.alerts ?? []).filter((alert) => filter === "all" || alert.severity === filter), [payload, filter]);
  const historyRows = useMemo(() => (payload?.history ?? [])
    .filter((row) => historyFilter === "all" || row.status === historyFilter)
    .slice(0, 50), [payload, historyFilter]);

  if (!target || authorized === false) return null;
  const summary = payload?.summary;
  const tone = summary?.critical ? "critical" : summary?.high ? "high" : "clear";

  return <>
    {createPortal(
      <button type="button" className={`treasury-alerts-trigger ${tone}`} onClick={() => setOpen(true)} disabled={authorized === null}>
        <span>ALERTAS</span>
        <strong>{summary?.total ?? "—"}</strong>
        <small>{summary?.critical ? `${summary.critical} crítico(s)` : summary?.high ? `${summary.high} alto(s)` : "tesouraria monitorada"}</small>
      </button>,
      target,
    )}

    {open ? <div className="treasury-alerts-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-alerts-dashboard" role="dialog" aria-modal="true" aria-label="Alertas executivos da Tesouraria">
        <header className="treasury-alerts-header">
          <div>
            <small>FINANCEIRO · MONITORAMENTO</small>
            <h2>Alertas executivos da Tesouraria</h2>
            <p>Regras explicáveis com ciclo de vida auditável: detecção, ciência, duração e normalização. Reconhecer um alerta não o resolve nem reduz sua gravidade.</p>
          </div>
          <div className="treasury-alerts-actions">
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Recalcular"}</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="treasury-alerts-message">{message}</div> : null}

        <div className="treasury-alerts-kpis">
          <article className={summary?.critical ? "danger" : "good"}><span>Alertas ativos</span><strong>{summary?.total ?? 0}</strong><small>{summary?.critical ?? 0} crítico(s)</small></article>
          <article className={summary?.unacknowledged ? "warning" : "good"}><span>Sem ciência</span><strong>{summary?.unacknowledged ?? 0}</strong><small>{summary?.acknowledged ?? 0} já reconhecido(s)</small></article>
          <article className={summary?.negativeForecast ? "danger" : "good"}><span>Caixa projetado</span><strong>{summary?.negativeForecast ?? 0}</strong><small>cenários negativos detectados</small></article>
          <article className={summary?.reconciliation ? "warning" : "good"}><span>Conciliação</span><strong>{summary?.reconciliation ?? 0}</strong><small>abaixo do limite configurado</small></article>
          <article className={summary?.closingOverdue ? "warning" : "good"}><span>Fechamentos</span><strong>{summary?.closingOverdue ?? 0}</strong><small>fora da cadência definida</small></article>
          <article className={summary?.criticalTasks ? "danger" : "good"}><span>Pendências críticas</span><strong>{summary?.criticalTasks ?? 0}</strong><small>causas técnicas ativas</small></article>
          <article><span>Último cálculo</span><strong>{dateTime(payload?.generatedAt ?? null)}</strong><small>atualização automática: 60 s</small></article>
        </div>

        <div className="treasury-alerts-grid">
          <section className="treasury-alerts-card settings-card">
            <header><div><small>REGRAS</small><h3>Configuração do monitoramento</h3></div><button type="button" onClick={() => void saveSettings()} disabled={!settings || saving}>{saving ? "Salvando…" : "Salvar regras"}</button></header>
            {settings ? <div className="treasury-alerts-settings">
              <label><span>Horizonte do caixa</span><select value={settings.forecastHorizonDays} onChange={(event) => setSettings({ ...settings, forecastHorizonDays: Number(event.target.value) })}><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option></select></label>
              <label><span>Conciliação mínima</span><input type="number" min="0" max="100" step="1" value={settings.reconciliationMinPct} onChange={(event) => setSettings({ ...settings, reconciliationMinPct: Number(event.target.value) })} /></label>
              <label><span>Cadência do fechamento</span><select value={settings.closingCadence} onChange={(event) => setSettings({ ...settings, closingCadence: event.target.value as "daily" | "monthly" })}><option value="daily">Diário · último dia útil anterior</option><option value="monthly">Mensal · último dia útil do mês anterior</option></select></label>
              <div className="toggles">
                <label><input type="checkbox" checked={settings.negativeForecastEnabled} onChange={(event) => setSettings({ ...settings, negativeForecastEnabled: event.target.checked })} /><span>Saldo projetado negativo</span></label>
                <label><input type="checkbox" checked={settings.criticalTasksEnabled} onChange={(event) => setSettings({ ...settings, criticalTasksEnabled: event.target.checked })} /><span>Pendências críticas</span></label>
                <label><input type="checkbox" checked={settings.reconciliationEnabled} onChange={(event) => setSettings({ ...settings, reconciliationEnabled: event.target.checked })} /><span>Conciliação abaixo do limite</span></label>
                <label><input type="checkbox" checked={settings.closingOverdueEnabled} onChange={(event) => setSettings({ ...settings, closingOverdueEnabled: event.target.checked })} /><span>Fechamento atrasado</span></label>
              </div>
              <p>Feriados ainda não são considerados na cadência; sábados e domingos são ignorados. Desativar uma regra encerra suas ocorrências ativas como “monitoramento desativado”, sem declarar normalização técnica.</p>
            </div> : null}
          </section>

          <section className="treasury-alerts-card status-card">
            <header><div><small>SITUAÇÃO</small><h3>Leitura executiva</h3></div></header>
            <div className={`treasury-alerts-health ${summary?.critical ? "danger" : summary?.high ? "warning" : "good"}`}>
              <strong>{summary?.critical ? "Ação imediata" : summary?.high ? "Atenção" : "Monitoramento controlado"}</strong>
              <p>{summary?.critical ? "Há pelo menos uma condição crítica que pode afetar caixa ou integridade do fechamento." : summary?.high ? "Não há alerta crítico, mas existem condições que precisam de tratamento operacional." : "Nenhuma das regras habilitadas está disparada neste momento."}</p>
            </div>
            <div className="treasury-alerts-filter" role="group" aria-label="Filtrar alertas">
              <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos</button>
              <button type="button" className={filter === "critical" ? "active" : ""} onClick={() => setFilter("critical")}>Críticos</button>
              <button type="button" className={filter === "high" ? "active" : ""} onClick={() => setFilter("high")}>Altos</button>
            </div>
          </section>

          <section className="treasury-alerts-card wide">
            <header><div><small>CENTRAL DE ALERTAS</small><h3>O que exige atenção</h3></div><strong>{visibleAlerts.length} item(ns)</strong></header>
            <div className="treasury-alerts-list">
              {visibleAlerts.length ? visibleAlerts.map((alert) => <article key={alert.occurrenceId} className={alert.severity}>
                <div className="alert-meta"><b>{severityLabel[alert.severity]}</b><span>{typeLabel[alert.type]}</span>{alert.acknowledgedAt ? <i className="ack">Ciente</i> : <i className="unack">Sem ciência</i>}</div>
                <div className="alert-body">
                  <strong>{alert.title}</strong>
                  <small>{alert.accountName}</small>
                  <div className="alert-timing"><span>Detectado {dateTime(alert.firstSeenAt)}</span><span>Ativo há {durationLabel(alert.firstSeenAt)}</span></div>
                  <p>{alert.detail}</p>
                  <em>{alert.action}</em>
                  {alert.acknowledgedAt ? <div className="alert-ack-detail"><b>Reconhecido por {alert.acknowledgedBy}</b><span>{dateTime(alert.acknowledgedAt)}{alert.acknowledgementNote ? ` · ${alert.acknowledgementNote}` : ""}</span></div> : null}
                </div>
                <div className="alert-side">
                  {alert.amount > 0 ? <strong>{money(alert.amount)}</strong> : null}
                  {alert.type === "reconciliation" && alert.metric !== null ? <span>{alert.metric.toFixed(1)}%</span> : null}
                  {!alert.acknowledgedAt ? <button type="button" className="ack-button" onClick={() => void acknowledge(alert)} disabled={saving}>Reconhecer</button> : null}
                  <button type="button" onClick={() => openSource(alert)}>Abrir origem</button>
                </div>
              </article>) : <div className="treasury-alerts-empty"><strong>Nenhum alerta ativo.</strong><p>As regras habilitadas estão dentro dos limites configurados neste momento.</p></div>}
            </div>
          </section>

          <section className="treasury-alerts-card wide history-card">
            <header>
              <div><small>HISTÓRICO AUDITÁVEL</small><h3>Ciclo de vida das ocorrências</h3></div>
              <div className="treasury-alerts-filter history-filter" role="group" aria-label="Filtrar histórico">
                <button type="button" className={historyFilter === "all" ? "active" : ""} onClick={() => setHistoryFilter("all")}>Todos</button>
                <button type="button" className={historyFilter === "active" ? "active" : ""} onClick={() => setHistoryFilter("active")}>Ativos</button>
                <button type="button" className={historyFilter === "resolved" ? "active" : ""} onClick={() => setHistoryFilter("resolved")}>Encerrados</button>
              </div>
            </header>
            <div className="treasury-alerts-history">
              {historyRows.length ? historyRows.map((row) => <article key={row.id} className={`${row.status} ${row.severity}`}>
                <div className="history-status">
                  <b>{row.status === "active" ? "Ativo" : row.resolutionReason === "monitoring_disabled" ? "Monitoramento desativado" : "Normalizado"}</b>
                  <span>{severityLabel[row.severity]} · {typeLabel[row.alertType]}</span>
                </div>
                <div className="history-main">
                  <strong>{row.title}</strong>
                  <small>{row.accountName}</small>
                  <p>Início: {dateTime(row.firstSeenAt)} · Última detecção: {dateTime(row.lastSeenAt)} · Duração: {durationLabel(row.firstSeenAt, row.resolvedAt)}</p>
                  {row.acknowledgedAt ? <em>Ciência: {row.acknowledgedBy} em {dateTime(row.acknowledgedAt)}{row.acknowledgementNote ? ` · ${row.acknowledgementNote}` : ""}</em> : <em>Sem registro de ciência.</em>}
                </div>
                <div className="history-end">
                  {row.status === "resolved" ? <><span>Encerrado</span><strong>{dateTime(row.resolvedAt)}</strong></> : <><span>Em acompanhamento</span><strong>{durationLabel(row.firstSeenAt)}</strong></>}
                </div>
              </article>) : <div className="treasury-alerts-empty"><strong>Sem ocorrências neste filtro.</strong><p>O histórico começa a ser formado a partir desta versão.</p></div>}
            </div>
          </section>
        </div>

        <footer className="treasury-alerts-footer">
          <span>Reconhecimento registra ciência; somente a normalização da causa encerra o alerta. Nenhuma ação financeira é executada automaticamente.</span>
          <span>{settings?.updatedBy ? `Regras atualizadas por ${settings.updatedBy} em ${dateTime(settings.updatedAt)}.` : "Regras padrão ativas."}</span>
        </footer>
      </section>
    </div> : null}
  </>;
}
