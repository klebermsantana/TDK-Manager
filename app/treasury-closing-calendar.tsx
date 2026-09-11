"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type DiagnosticAccount = {
  accountId: number;
  accountName: string;
  bankName: string | null;
  bookBalance: number;
  statementBalance: number | null;
  closingDifference: number | null;
  reconciliationCoverage: number;
  unallocatedAmount: number;
  ready: boolean;
  issues: string[];
};

type DiagnosticPayload = {
  date: string;
  accounts: DiagnosticAccount[];
};

type ClosingRecord = {
  id: number;
  bankAccountId: number;
  accountName: string;
  bankName: string | null;
  closingDate: string;
  status: "closed" | "reopened";
  bookBalance: number;
  statementBalance: number;
  closingDifference: number;
  reconciliationCoverage: number;
  unallocatedAmount: number;
  closedBy: string;
  closedAt: string;
  reopenedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
};

type OfficialPayload = {
  records: ClosingRecord[];
  latestActive: ClosingRecord[];
};

type Cadence = "daily" | "monthly";

type CalendarDay = {
  key: string;
  day: number;
  weekday: number;
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const localMonthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "—";
const monthTitle = (month: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
const dateTimeKey = (value: string | null) => value ? localDateKey(new Date(value)) : null;
const pad2 = (value: number) => String(value).padStart(2, "0");

function monthDays(month: string): CalendarDay[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1;
    const date = new Date(Date.UTC(year, monthNumber - 1, day, 12));
    return { key: `${year}-${pad2(monthNumber)}-${pad2(day)}`, day, weekday: date.getUTCDay() };
  });
}

function lastWeekdayOfMonth(month: string) {
  const days = monthDays(month);
  return [...days].reverse().find((item) => item.weekday !== 0 && item.weekday !== 6)?.key ?? days.at(-1)?.key ?? `${month}-01`;
}

function previousMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1, 12));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

function nextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 1, 12));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

export function TreasuryClosingCalendar() {
  const today = localDateKey();
  const currentMonth = localMonthKey();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [selectedDate, setSelectedDate] = useState(today);
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [diagnostics, setDiagnostics] = useState<DiagnosticPayload | null>(null);
  const [official, setOfficial] = useState<OfficialPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const locate = () => setTarget(document.querySelector<HTMLElement>(".treasury-actions"));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function refresh(requestedDate = selectedDate, silent = false) {
    if (!silent) setLoading(true);
    try {
      const [diagnosticResponse, officialResponse] = await Promise.all([
        fetch(`/api/treasury-closing?date=${encodeURIComponent(requestedDate)}`, { cache: "no-store" }),
        fetch("/api/treasury-official-closing", { cache: "no-store" }),
      ]);
      if (diagnosticResponse.status === 403 || officialResponse.status === 403) {
        setAuthorized(false);
        return;
      }
      const diagnosticPayload = await diagnosticResponse.json().catch(() => ({})) as DiagnosticPayload & { error?: string };
      const officialPayload = await officialResponse.json().catch(() => ({})) as OfficialPayload & { error?: string };
      if (!diagnosticResponse.ok || !officialResponse.ok) {
        setMessage(diagnosticPayload.error ?? officialPayload.error ?? "Não foi possível carregar o calendário de fechamento.");
        return;
      }
      setDiagnostics(diagnosticPayload);
      setOfficial(officialPayload);
      setAuthorized(true);
      setMessage("");
    } catch {
      setMessage("Não foi possível carregar o calendário de fechamento.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (target && authorized === null) void refresh(today, true);
  }, [target, authorized]);

  useEffect(() => {
    if (open) void refresh(selectedDate);
  }, [open]);

  const activeByAccount = useMemo(() => new Map((official?.latestActive ?? []).map((record) => [record.bankAccountId, record])), [official]);
  const days = useMemo(() => monthDays(month), [month]);
  const firstOffset = days.length ? (days[0].weekday + 6) % 7 : 0;
  const monthDeadline = useMemo(() => lastWeekdayOfMonth(month), [month]);
  const totalAccounts = diagnostics?.accounts.length ?? 0;

  function dayState(day: CalendarDay) {
    const protectedCount = (diagnostics?.accounts ?? []).filter((account) => {
      const closing = activeByAccount.get(account.accountId);
      return Boolean(closing && closing.closingDate >= day.key);
    }).length;
    const allProtected = totalAccounts > 0 && protectedCount === totalAccounts;
    const partiallyProtected = protectedCount > 0 && !allProtected;
    const isFuture = day.key > today;
    const expected = cadence === "daily"
      ? day.weekday !== 0 && day.weekday !== 6
      : day.key === monthDeadline;
    const overdue = !isFuture && day.key < today && expected && !allProtected;
    const reopened = (official?.records ?? []).some((record) => dateTimeKey(record.reopenedAt) === day.key);
    const closedEvent = (official?.records ?? []).some((record) => record.closingDate === day.key);
    return { protectedCount, allProtected, partiallyProtected, isFuture, overdue, reopened, closedEvent };
  }

  const overdueDays = useMemo(() => days.filter((day) => dayState(day).overdue).length, [days, diagnostics, official, cadence, monthDeadline, today]);
  const monthClosings = useMemo(() => (official?.records ?? []).filter((record) => record.closingDate.startsWith(`${month}-`)).length, [official, month]);
  const monthReopenings = useMemo(() => (official?.records ?? []).filter((record) => dateTimeKey(record.reopenedAt)?.startsWith(`${month}-`)).length, [official, month]);
  const selectedReady = diagnostics?.accounts.filter((account) => account.ready).length ?? 0;
  const selectedProtected = diagnostics?.accounts.filter((account) => {
    const closing = activeByAccount.get(account.accountId);
    return Boolean(closing && closing.closingDate >= selectedDate);
  }).length ?? 0;

  function chooseMonth(next: string) {
    if (next > currentMonth) return;
    setMonth(next);
    const candidate = next === currentMonth ? today : lastWeekdayOfMonth(next);
    setSelectedDate(candidate);
    void refresh(candidate);
  }

  function chooseDay(day: CalendarDay) {
    if (day.key > today) return;
    setSelectedDate(day.key);
    void refresh(day.key);
  }

  function openOfficialClosing() {
    window.dispatchEvent(new CustomEvent("tdk:open-treasury-official-closing", { detail: { date: selectedDate } }));
    setOpen(false);
  }

  if (!target || authorized === false) return null;

  const selectedRecords = (official?.records ?? []).filter((record) => record.closingDate === selectedDate || dateTimeKey(record.reopenedAt) === selectedDate);
  const monthEvents = (official?.records ?? [])
    .filter((record) => record.closingDate.startsWith(`${month}-`) || dateTimeKey(record.reopenedAt)?.startsWith(`${month}-`))
    .sort((a, b) => (b.reopenedAt ?? b.closedAt).localeCompare(a.reopenedAt ?? a.closedAt))
    .slice(0, 20);

  return <>
    {createPortal(<button type="button" className="treasury-calendar-trigger" onClick={() => setOpen(true)} disabled={authorized === null}>
      <span>CALENDÁRIO</span>
      <strong>{overdueDays}</strong>
      <small>{overdueDays === 1 ? "data pendente" : "datas pendentes"}</small>
    </button>, target)}

    {open ? <div className="treasury-calendar-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-calendar-dashboard" role="dialog" aria-modal="true" aria-label="Calendário de fechamentos da tesouraria">
        <header className="treasury-calendar-header">
          <div>
            <small>FINANCEIRO · TESOURARIA</small>
            <h2>Calendário de fechamentos</h2>
            <p>Acompanha a proteção oficial por data e, no detalhe diário, confere quais contas estão fechadas, prontas ou com pendências.</p>
          </div>
          <div className="treasury-calendar-header-actions">
            <div className="cadence" role="group" aria-label="Regra de acompanhamento">
              <button type="button" className={cadence === "daily" ? "active" : ""} onClick={() => setCadence("daily")}>Diário</button>
              <button type="button" className={cadence === "monthly" ? "active" : ""} onClick={() => setCadence("monthly")}>Mensal</button>
            </div>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="treasury-calendar-message">{message}</div> : null}

        <div className="treasury-calendar-kpis">
          <article><span>Data selecionada</span><strong>{shortDate(selectedDate)}</strong><small>{selectedProtected}/{totalAccounts} conta(s) protegida(s)</small></article>
          <article className={selectedReady === totalAccounts && totalAccounts ? "good" : "warning"}><span>Conferidas na data</span><strong>{selectedReady}/{totalAccounts}</strong><small>diagnóstico técnico em tempo real</small></article>
          <article className={overdueDays ? "danger" : "good"}><span>{cadence === "daily" ? "Dias atrasados" : "Fechamento mensal atrasado"}</span><strong>{overdueDays}</strong><small>{cadence === "daily" ? "seg–sex ainda não protegidos" : "último dia útil estimado"}</small></article>
          <article><span>Fechamentos no mês</span><strong>{monthClosings}</strong><small>snapshots com data de corte no mês</small></article>
          <article className={monthReopenings ? "warning" : ""}><span>Reaberturas no mês</span><strong>{monthReopenings}</strong><small>eventos registrados na auditoria</small></article>
        </div>

        <div className="treasury-calendar-main">
          <section className="treasury-calendar-card calendar-card">
            <header className="calendar-toolbar">
              <button type="button" onClick={() => chooseMonth(previousMonth(month))}>‹</button>
              <div><small>VISÃO MENSAL</small><h3>{monthTitle(month)}</h3></div>
              <button type="button" onClick={() => chooseMonth(nextMonth(month))} disabled={month >= currentMonth}>›</button>
            </header>
            <div className="treasury-calendar-weekdays"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div>
            <div className="treasury-calendar-grid">
              {Array.from({ length: firstOffset }, (_, index) => <span className="calendar-empty" key={`empty-${index}`} />)}
              {days.map((day) => {
                const state = dayState(day);
                const statusClass = state.isFuture ? "future" : state.allProtected ? "closed" : state.partiallyProtected ? "partial" : state.overdue ? "overdue" : "open";
                const label = state.isFuture ? "Futuro" : state.allProtected ? "Fechado" : state.partiallyProtected ? "Parcial" : state.overdue ? "Atrasado" : "Em aberto";
                return <button type="button" key={day.key} className={`calendar-day ${statusClass}${selectedDate === day.key ? " selected" : ""}`} disabled={state.isFuture} onClick={() => chooseDay(day)}>
                  <span className="day-number">{day.day}</span>
                  <strong>{label}</strong>
                  <small>{totalAccounts ? `${state.protectedCount}/${totalAccounts} protegidas` : "sem contas"}</small>
                  <div className="markers">{state.closedEvent ? <i>Fechamento</i> : null}{state.reopened ? <i className="reopened">Reaberto</i> : null}</div>
                </button>;
              })}
            </div>
            <footer className="calendar-legend"><span><i className="closed" />Fechado</span><span><i className="partial" />Parcial</span><span><i className="open" />Em aberto</span><span><i className="overdue" />Atrasado</span><small>{cadence === "daily" ? "Atraso: dias úteis (seg–sex) anteriores a hoje sem proteção completa." : "Atraso mensal: último dia útil estimado do mês sem proteção completa; feriados não são considerados."}</small></footer>
          </section>

          <section className="treasury-calendar-card detail-card">
            <header><div><small>DETALHE DIÁRIO</small><h3>{shortDate(selectedDate)}</h3></div><button type="button" className="primary" onClick={openOfficialClosing}>Fechamento oficial</button></header>
            <div className="treasury-calendar-account-list">
              {(diagnostics?.accounts ?? []).map((account) => {
                const active = activeByAccount.get(account.accountId);
                const protectedAtDate = Boolean(active && active.closingDate >= selectedDate);
                const reopenedAtDate = (official?.records ?? []).some((record) => record.bankAccountId === account.accountId && record.status === "reopened" && record.closingDate === selectedDate);
                const state = protectedAtDate ? "closed" : reopenedAtDate ? "reopened" : account.ready ? "ready" : "open";
                const label = protectedAtDate ? "Fechada" : reopenedAtDate ? "Reaberta" : account.ready ? "Conferida" : "Pendências";
                return <article key={account.accountId} className={state}>
                  <div><strong>{account.accountName}</strong><small>{account.bankName ?? "Conta bancária"}</small></div>
                  <div><span>TDK</span><b>{money(account.bookBalance)}</b></div>
                  <div><span>Extrato</span><b>{account.statementBalance === null ? "—" : money(account.statementBalance)}</b></div>
                  <div><span>Diferença</span><b>{account.closingDifference === null ? "—" : money(account.closingDifference)}</b></div>
                  <div className="status"><b>{label}</b><small>{protectedAtDate && active ? `protegida até ${shortDate(active.closingDate)}` : account.ready ? `conciliação ${account.reconciliationCoverage.toFixed(0)}%` : account.issues[0] ?? "revisar"}</small></div>
                </article>;
              })}
              {!diagnostics?.accounts.length ? <p className="empty">Nenhuma conta ativa encontrada.</p> : null}
            </div>
            {selectedRecords.length ? <div className="selected-events"><strong>Eventos ligados à data</strong>{selectedRecords.map((record) => <p key={`${record.id}-${record.status}`}>• {record.accountName}: {record.status === "closed" ? "fechamento ativo" : "fechamento posteriormente reaberto"}{record.reopenReason ? ` · ${record.reopenReason}` : ""}</p>)}</div> : null}
          </section>
        </div>

        <section className="treasury-calendar-card events-card">
          <header><div><small>TRILHA DO MÊS</small><h3>Fechamentos e reaberturas</h3></div><strong>{monthEvents.length}</strong></header>
          <div className="treasury-calendar-events">
            {monthEvents.map((record) => <article key={`${record.id}-${record.reopenedAt ?? record.closedAt}`}>
              <div><strong>{record.accountName}</strong><small>{record.bankName ?? "Conta bancária"}</small></div>
              <div><span>Corte</span><b>{shortDate(record.closingDate)}</b></div>
              <div><span>Snapshot TDK</span><b>{money(record.bookBalance)}</b></div>
              <div><span>Status atual</span><b className={record.status}>{record.status === "closed" ? "Fechado" : "Reaberto"}</b></div>
              <small>{record.status === "closed" ? `Fechado por ${record.closedBy}` : `Reaberto por ${record.reopenedBy ?? "—"}${record.reopenReason ? ` · ${record.reopenReason}` : ""}`}</small>
            </article>)}
            {!monthEvents.length ? <p className="empty">Nenhum fechamento ou reabertura registrado neste mês.</p> : null}
          </div>
        </section>

        <footer className="treasury-calendar-footer">
          <span>A visão mensal usa os fechamentos oficiais ativos para indicar quais datas estão protegidas. “Conferida” é recalculada ao selecionar a data.</span>
          <span>O modo mensal usa o último dia útil estimado por seg–sex; não aplica calendário de feriados.</span>
        </footer>
      </section>
    </div> : null}
  </>;
}
