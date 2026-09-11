"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Risk = "controlled" | "warning" | "high" | "critical";
type Domain = "cash" | "critical_tasks" | "reconciliation" | "closing";
type Horizon = 7 | 15 | 30;
type Day = {
  date: string;
  risk: Risk;
  effectiveCapacity: number;
  fullCapacity: number;
  capacityPct: number;
  loadPerEffectivePerson: number | null;
  unavailable: Array<{ id: number; name: string }>;
  limited: Array<{ id: number; name: string }>;
  domains: Array<{
    domain: Domain;
    label: string;
    risk: Risk;
    eligible: number;
    habilitated: number;
    specialists: number;
    configuredSpecialists: number;
    weightedCoverage: number;
    uncovered: boolean;
    singlePoint: boolean;
    specialistGap: boolean;
    people: Array<{ id: number; name: string; availability: string; skill: number }>;
  }>;
  coverageRelations: Array<{ sourceUserId: number | null; sourceName: string; coverageUserId: number; coverageName: string }>;
};
type Attention = { key: string; date: string; risk: Risk; title: string; detail: string; domain: Domain };
type Absence = {
  id: number;
  userId: number;
  userName: string;
  type: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  coverageUserId: number | null;
  coverageName: string | null;
  notes: string | null;
};
type Payload = {
  generatedAt: string;
  horizon: Horizon;
  today: string;
  endDate: string;
  currentLoadPoints: number;
  teamSize: number;
  days: Day[];
  attention: Attention[];
  absences: Absence[];
  summary: {
    businessDays: number;
    criticalDays: number;
    highDays: number;
    warningDays: number;
    controlledDays: number;
    lowestCapacityPct: number;
    uncoveredEvents: number;
    singlePointEvents: number;
    scheduledAbsences: number;
    configuredSpecialists: number;
  };
  methodology: { note: string; businessDays: string; thresholds: string };
};

const riskLabel: Record<Risk, string> = { controlled: "Controlado", warning: "Atenção", high: "Alto", critical: "Crítico" };
const typeLabel: Record<string, string> = {
  vacation: "Férias",
  day_off: "Folga",
  reduced_hours: "Horário reduzido",
  temporary_unavailability: "Indisponibilidade",
};
const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00`));

export function TreasuryCapacityForecastDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [horizon, setHorizon] = useState<Horizon>(15);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    const locate = () => setTarget(document.querySelector<HTMLElement>(".receivable-metrics"));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function refresh(silent = false, nextHorizon = horizon) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/treasury-capacity-forecast?horizon=${nextHorizon}`, { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) {
        if (!silent) setMessage(result.error ?? "Não foi possível carregar a previsão de capacidade.");
        return;
      }
      setPayload(result);
      setAuthorized(true);
      setMessage("");
      setSelectedDate((current) => current && result.days.some((day) => day.date === current) ? current : result.days[0]?.date ?? null);
    } catch {
      if (!silent) setMessage("Não foi possível carregar a previsão de capacidade.");
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
  }, [target, authorized, horizon]);

  const selectedDay = useMemo(() => payload?.days.find((day) => day.date === selectedDate) ?? null, [payload, selectedDate]);

  async function changeHorizon(value: Horizon) {
    setHorizon(value);
    await refresh(false, value);
  }

  if (!target || authorized === false) return null;
  const summary = payload?.summary;
  const triggerTone = summary?.criticalDays ? "danger" : summary?.highDays ? "warning" : "clear";

  return <>
    {createPortal(
      <button type="button" className={`treasury-capacity-forecast-trigger ${triggerTone}`} onClick={() => setOpen(true)} disabled={authorized === null}>
        <span>PREVISÃO</span>
        <strong>{(summary?.criticalDays ?? 0) + (summary?.highDays ?? 0)}</strong>
        <small>{summary?.criticalDays ? `${summary.criticalDays} dia(s) crítico(s)` : summary?.highDays ? `${summary.highDays} dia(s) de risco alto` : "cobertura futura controlada"}</small>
      </button>,
      target,
    )}

    {open ? <div className="treasury-capacity-forecast-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-capacity-forecast-dashboard" role="dialog" aria-modal="true" aria-label="Previsão de capacidade da Tesouraria">
        <header className="treasury-capacity-forecast-header">
          <div>
            <small>TESOURARIA · PREVISÃO DE CAPACIDADE</small>
            <h2>Cobertura operacional futura</h2>
            <p>Antecipe ausências, pontos únicos e competências descobertas. Esta visão projeta disponibilidade programada — não tenta adivinhar demanda futura.</p>
          </div>
          <div className="forecast-header-actions">
            <div className="forecast-horizons">{([7, 15, 30] as Horizon[]).map((value) => <button type="button" key={value} className={horizon === value ? "active" : ""} onClick={() => void changeHorizon(value)}>{value} dias</button>)}</div>
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="treasury-capacity-forecast-message">{message}</div> : null}

        <div className="treasury-capacity-forecast-kpis">
          <article><span>Dias úteis</span><strong>{summary?.businessDays ?? 0}</strong><small>nos próximos {horizon} dias corridos</small></article>
          <article className={summary?.criticalDays ? "danger" : "good"}><span>Dias críticos</span><strong>{summary?.criticalDays ?? 0}</strong><small>{summary?.uncoveredEvents ?? 0} competência(s) sem cobertura</small></article>
          <article className={summary?.highDays ? "warning" : "good"}><span>Risco alto</span><strong>{summary?.highDays ?? 0}</strong><small>{summary?.singlePointEvents ?? 0} ponto(s) único(s)</small></article>
          <article className={(summary?.lowestCapacityPct ?? 100) < 70 ? "danger" : (summary?.lowestCapacityPct ?? 100) < 85 ? "warning" : "good"}><span>Menor cobertura</span><strong>{summary?.lowestCapacityPct ?? 100}%</strong><small>capacidade equivalente mínima</small></article>
          <article><span>Ausências programadas</span><strong>{summary?.scheduledAbsences ?? 0}</strong><small>no horizonte selecionado</small></article>
          <article><span>Carga ativa hoje</span><strong>{payload?.currentLoadPoints ?? 0}</strong><small>pontos usados só como referência de pressão</small></article>
        </div>

        <section className="forecast-card wide timeline-card">
          <header><div><small>LINHA DO TEMPO</small><h3>Risco por dia útil</h3></div><strong>{payload?.today ? `${payload.today} → ${payload.endDate}` : ""}</strong></header>
          <div className="forecast-days">
            {(payload?.days ?? []).map((day) => <button type="button" key={day.date} className={`${day.risk} ${selectedDate === day.date ? "selected" : ""}`} onClick={() => setSelectedDate(day.date)}>
              <span>{dateLabel(day.date)}</span>
              <strong>{day.capacityPct}%</strong>
              <div className="forecast-capacity-bar"><i style={{ width: `${Math.max(0, Math.min(100, day.capacityPct))}%` }} /></div>
              <b>{riskLabel[day.risk]}</b>
              <small>{day.effectiveCapacity}/{day.fullCapacity} FTE{day.unavailable.length ? ` · ${day.unavailable.length} fora` : ""}</small>
            </button>)}
          </div>
        </section>

        <div className="forecast-grid">
          <section className="forecast-card day-card">
            <header><div><small>DIA SELECIONADO</small><h3>{selectedDay ? dateLabel(selectedDay.date) : "—"}</h3></div>{selectedDay ? <b className={`risk-pill ${selectedDay.risk}`}>{riskLabel[selectedDay.risk]}</b> : null}</header>
            {selectedDay ? <div className="forecast-day-detail">
              <div className="forecast-day-summary">
                <div><span>Capacidade</span><strong>{selectedDay.effectiveCapacity}/{selectedDay.fullCapacity} FTE</strong></div>
                <div><span>Cobertura</span><strong>{selectedDay.capacityPct}%</strong></div>
                <div><span>Pressão c/ carga atual</span><strong>{selectedDay.loadPerEffectivePerson ?? "—"}</strong><small>pts por FTE</small></div>
              </div>
              {selectedDay.unavailable.length || selectedDay.limited.length ? <div className="forecast-people-status">
                {selectedDay.unavailable.length ? <p><b>Indisponíveis:</b> {selectedDay.unavailable.map((row) => row.name).join(", ")}</p> : null}
                {selectedDay.limited.length ? <p><b>Limitados:</b> {selectedDay.limited.map((row) => row.name).join(", ")}</p> : null}
                {selectedDay.coverageRelations.length ? <p><b>Coberturas:</b> {selectedDay.coverageRelations.map((row) => `${row.sourceName} → ${row.coverageName}`).join(" · ")}</p> : null}
              </div> : null}
              <div className="forecast-domains">
                {selectedDay.domains.map((domain) => <article key={domain.domain} className={domain.risk}>
                  <div><strong>{domain.label}</strong><b>{riskLabel[domain.risk]}</b></div>
                  <p><span>{domain.eligible} elegível(is)</span><span>{domain.habilitated} habilitado(s)</span><span>{domain.specialists} especialista(s)</span></p>
                  <small>Cobertura ponderada: {domain.weightedCoverage} FTE</small>
                  {domain.uncovered ? <em>Sem cobertura disponível.</em> : domain.singlePoint ? <em>Ponto único: {domain.people[0]?.name}.</em> : domain.specialistGap ? <em>Especialista cadastrado estará ausente.</em> : null}
                </article>)}
              </div>
            </div> : <div className="forecast-empty">Nenhum dia útil no horizonte selecionado.</div>}
          </section>

          <section className="forecast-card attention-card">
            <header><div><small>ANTECIPAÇÃO</small><h3>Pontos de risco</h3></div><strong>{payload?.attention.length ?? 0}</strong></header>
            <div className="forecast-attention-list">
              {(payload?.attention ?? []).length ? payload!.attention.map((item) => <article key={item.key} className={item.risk} onClick={() => setSelectedDate(item.date)}>
                <div><b>{riskLabel[item.risk]}</b><span>{dateLabel(item.date)}</span></div>
                <strong>{item.title}</strong><p>{item.detail}</p>
              </article>) : <div className="forecast-empty"><strong>Nenhum risco relevante identificado.</strong><p>A cobertura programada está consistente no horizonte selecionado.</p></div>}
            </div>
          </section>
        </div>

        <section className="forecast-card wide absences-card">
          <header><div><small>AGENDA</small><h3>Ausências e jornadas reduzidas</h3></div><strong>{payload?.absences.length ?? 0}</strong></header>
          <div className="forecast-absences">
            {(payload?.absences ?? []).length ? payload!.absences.map((row) => <article key={row.id}>
              <div><strong>{row.userName}</strong><b>{typeLabel[row.type] ?? row.type}</b></div>
              <p>{new Intl.DateTimeFormat("pt-BR").format(new Date(`${row.startDate}T12:00:00`))} → {new Intl.DateTimeFormat("pt-BR").format(new Date(`${row.endDate}T12:00:00`))}{row.startTime && row.endTime ? ` · ${row.startTime}–${row.endTime}` : ""}</p>
              <small>{row.coverageName ? `Cobertura: ${row.coverageName}` : "Sem cobertura temporária definida"}{row.notes ? ` · ${row.notes}` : ""}</small>
            </article>) : <div className="forecast-empty">Nenhuma ausência programada dentro do horizonte.</div>}
          </div>
        </section>

        <footer className="treasury-capacity-forecast-footer"><span>{payload?.methodology.note}</span><span>{payload?.methodology.businessDays}</span><span>{payload?.methodology.thresholds}</span></footer>
      </section>
    </div> : null}
  </>;
}
