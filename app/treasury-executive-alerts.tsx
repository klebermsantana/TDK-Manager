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
  summary: {
    total: number;
    critical: number;
    high: number;
    negativeForecast: number;
    criticalTasks: number;
    reconciliation: number;
    closingOverdue: number;
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
        body: JSON.stringify(settings),
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

  function openSource(alert: Alert) {
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
            <p>Regras explicáveis que acompanham caixa projetado, pendências críticas, conciliação bancária e fechamento. O painel atualiza automaticamente a cada 60 segundos enquanto o TDK Manager estiver aberto.</p>
          </div>
          <div className="treasury-alerts-actions">
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Recalcular"}</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="treasury-alerts-message">{message}</div> : null}

        <div className="treasury-alerts-kpis">
          <article className={summary?.critical ? "danger" : "good"}><span>Alertas ativos</span><strong>{summary?.total ?? 0}</strong><small>{summary?.critical ?? 0} crítico(s)</small></article>
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
              <p>Feriados ainda não são considerados na cadência; sábados e domingos são ignorados. Alterações ficam identificadas pelo usuário que salvou a configuração.</p>
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
              {visibleAlerts.length ? visibleAlerts.map((alert) => <article key={alert.key} className={alert.severity}>
                <div className="alert-meta"><b>{severityLabel[alert.severity]}</b><span>{typeLabel[alert.type]}</span></div>
                <div className="alert-body">
                  <strong>{alert.title}</strong>
                  <small>{alert.accountName}</small>
                  <p>{alert.detail}</p>
                  <em>{alert.action}</em>
                </div>
                <div className="alert-side">
                  {alert.amount > 0 ? <strong>{money(alert.amount)}</strong> : null}
                  {alert.type === "reconciliation" && alert.metric !== null ? <span>{alert.metric.toFixed(1)}%</span> : null}
                  <button type="button" onClick={() => openSource(alert)}>Abrir origem</button>
                </div>
              </article>) : <div className="treasury-alerts-empty"><strong>Nenhum alerta ativo.</strong><p>As regras habilitadas estão dentro dos limites configurados neste momento.</p></div>}
            </div>
          </section>
        </div>

        <footer className="treasury-alerts-footer">
          <span>Os alertas são diagnósticos e não executam baixa, conciliação, transferência ou fechamento automaticamente.</span>
          <span>{settings?.updatedBy ? `Regras atualizadas por ${settings.updatedBy} em ${dateTime(settings.updatedAt)}.` : "Regras padrão ativas."}</span>
        </footer>
      </section>
    </div> : null}
  </>;
}
