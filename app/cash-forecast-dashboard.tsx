"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type RealizedEvent = { id: number; eventDate: string; amount: number; eventType: string; source: string };
type CashEntry = {
  id: string;
  billingId: number;
  billingNumber: string;
  saleNumber: string;
  companyName: string;
  installmentNumber: number | null;
  dueDate: string | null;
  grossAmount: number;
  receivedAmount: number;
  openAmount: number;
  paymentDate: string | null;
  realizedEvents: RealizedEvent[];
  status: string;
  createdAt: string;
  updatedAt: string;
  source: "receivable" | "billing";
};

type CashPayload = {
  entries: CashEntry[];
  dataQuality: {
    billingsWithoutInstallments: number;
    billingsWithoutDueDate: number;
    receivedWithoutPaymentDate: number;
    legacySnapshotEvents: number;
  };
};

type Horizon = "30" | "60" | "90";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addDaysKey(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function daysLate(dueDate: string | null) {
  if (!dueDate) return 0;
  const due = new Date(`${dueDate}T12:00:00`);
  const now = new Date(`${localDateKey()}T12:00:00`);
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000));
}

function shortDate(value: string | null) {
  if (!value) return "Sem vencimento";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(`${value}T12:00:00`));
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" })
    .format(new Date(year, month - 1, 1))
    .replace(" de ", "/");
}

function futureMonths(count: number) {
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function realizedInMonth(items: CashEntry[], month: string) {
  return items.reduce((total, item) => total + item.realizedEvents
    .filter((event) => event.eventDate.startsWith(month))
    .reduce((sum, event) => sum + Number(event.amount), 0), 0);
}

function riskLabel(oldestDays: number, overdue: number) {
  if (oldestDays > 60) return { label: "Crítico", className: "danger" };
  if (oldestDays > 30) return { label: "Alto", className: "danger" };
  if (oldestDays > 7) return { label: "Atenção", className: "warning" };
  if (overdue > 0) return { label: "Atenção", className: "warning" };
  return { label: "Regular", className: "good" };
}

export function CashForecastDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [payload, setPayload] = useState<CashPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [horizon, setHorizon] = useState<Horizon>("30");
  const [client, setClient] = useState("");
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
      const response = await fetch("/api/cash-forecast", { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      if (!response.ok) {
        setMessage("Não foi possível calcular o forecast de recebimentos.");
        return;
      }
      setPayload(await response.json() as CashPayload);
      setAuthorized(true);
      setMessage("");
    } catch {
      setMessage("Não foi possível calcular o forecast de recebimentos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!target || authorized !== null) return;
    void refresh(true);
  }, [target, authorized]);

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  const clients = useMemo(
    () => [...new Set((payload?.entries ?? []).map((item) => item.companyName).filter(Boolean))].sort(),
    [payload],
  );

  const entries = useMemo(
    () => (payload?.entries ?? []).filter((item) => !client || item.companyName === client),
    [payload, client],
  );

  const summary = useMemo(() => {
    const today = localDateKey();
    const limit = addDaysKey(Number(horizon));
    const currentMonth = monthKey();
    const openEntries = entries.filter((item) => item.openAmount > 0);
    const overdueEntries = openEntries.filter((item) => item.dueDate && item.dueDate < today);
    const futureEntries = openEntries.filter((item) => item.dueDate && item.dueDate >= today && item.dueDate <= limit);
    const outstanding = openEntries.reduce((total, item) => total + item.openAmount, 0);
    const overdue = overdueEntries.reduce((total, item) => total + item.openAmount, 0);
    const horizonAmount = futureEntries.reduce((total, item) => total + item.openAmount, 0);
    const receivedMonth = realizedInMonth(entries, currentMonth);
    const noDue = openEntries.filter((item) => !item.dueDate).reduce((total, item) => total + item.openAmount, 0);
    const fallback = openEntries.filter((item) => item.source === "billing").length;
    return {
      outstanding,
      overdue,
      overdueCount: overdueEntries.length,
      horizonAmount,
      horizonCount: futureEntries.length,
      receivedMonth,
      noDue,
      noDueCount: openEntries.filter((item) => !item.dueDate).length,
      fallback,
      overdueRatio: outstanding > 0 ? overdue / outstanding * 100 : null,
    };
  }, [entries, horizon]);

  const aging = useMemo(() => {
    const today = localDateKey();
    const buckets = [
      { key: "future", label: "A vencer", amount: 0, count: 0 },
      { key: "1-7", label: "1–7 dias", amount: 0, count: 0 },
      { key: "8-30", label: "8–30 dias", amount: 0, count: 0 },
      { key: "31-60", label: "31–60 dias", amount: 0, count: 0 },
      { key: "60+", label: "> 60 dias", amount: 0, count: 0 },
      { key: "nodue", label: "Sem vencimento", amount: 0, count: 0 },
    ];
    entries.filter((item) => item.openAmount > 0).forEach((item) => {
      let key = "future";
      if (!item.dueDate) key = "nodue";
      else if (item.dueDate < today) {
        const late = daysLate(item.dueDate);
        key = late <= 7 ? "1-7" : late <= 30 ? "8-30" : late <= 60 ? "31-60" : "60+";
      }
      const bucket = buckets.find((item) => item.key === key)!;
      bucket.amount += item.openAmount;
      bucket.count += 1;
    });
    return buckets;
  }, [entries]);

  const monthly = useMemo(() => {
    const keys = futureMonths(6);
    return keys.map((key) => ({
      key,
      label: monthLabel(key),
      amount: entries
        .filter((item) => item.openAmount > 0 && item.dueDate?.startsWith(key))
        .reduce((total, item) => total + item.openAmount, 0),
    }));
  }, [entries]);

  const maxMonthly = Math.max(1, ...monthly.map((item) => item.amount));

  const clientRows = useMemo(() => {
    const today = localDateKey();
    const currentMonth = monthKey();
    const map = new Map<string, CashEntry[]>();
    (payload?.entries ?? []).forEach((item) => map.set(item.companyName, [...(map.get(item.companyName) ?? []), item]));
    return [...map.entries()].map(([name, items]) => {
      const openItems = items.filter((item) => item.openAmount > 0);
      const overdueItems = openItems.filter((item) => item.dueDate && item.dueDate < today);
      const outstanding = openItems.reduce((total, item) => total + item.openAmount, 0);
      const overdue = overdueItems.reduce((total, item) => total + item.openAmount, 0);
      const next30 = openItems
        .filter((item) => item.dueDate && item.dueDate >= today && item.dueDate <= addDaysKey(30))
        .reduce((total, item) => total + item.openAmount, 0);
      const receivedMonth = realizedInMonth(items, currentMonth);
      const oldestDays = Math.max(0, ...overdueItems.map((item) => daysLate(item.dueDate)));
      return { name, outstanding, overdue, next30, receivedMonth, oldestDays, openCount: openItems.length, risk: riskLabel(oldestDays, overdue) };
    }).filter((item) => item.outstanding > 0 || item.receivedMonth !== 0)
      .sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding);
  }, [payload]);

  const concentration = useMemo(() => {
    const total = clientRows.reduce((sum, item) => sum + item.outstanding, 0);
    const topThree = [...clientRows].sort((a, b) => b.outstanding - a.outstanding).slice(0, 3).reduce((sum, item) => sum + item.outstanding, 0);
    return total > 0 ? topThree / total * 100 : null;
  }, [clientRows]);

  const agenda = useMemo(() => entries
    .filter((item) => item.openAmount > 0)
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return b.openAmount - a.openAmount;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    })
    .slice(0, 14), [entries]);

  if (!target || authorized !== true) return null;

  const trigger = (
    <button type="button" className="cash-forecast-trigger" onClick={() => setOpen(true)}>
      <span>FORECAST</span>
      <strong>Entradas de caixa</strong>
      <small>{money(summary.outstanding)} em aberto</small>
    </button>
  );

  return <>
    {createPortal(trigger, target)}
    {open ? <div className="cash-forecast-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="cash-forecast-dashboard" role="dialog" aria-modal="true" aria-label="Forecast de entradas de caixa">
        <header className="cash-forecast-header">
          <div>
            <small>FINANCEIRO · RECEBIMENTOS</small>
            <h2>Forecast de entradas de caixa</h2>
            <p>Fluxo contratual pelos vencimentos, recebimentos realizados e exposição a atrasos. Não inclui contas a pagar nesta visão.</p>
          </div>
          <div className="cash-forecast-actions">
            <label><span>Horizonte</span><select value={horizon} onChange={(event) => setHorizon(event.target.value as Horizon)}><option value="30">Próximos 30 dias</option><option value="60">Próximos 60 dias</option><option value="90">Próximos 90 dias</option></select></label>
            <label><span>Cliente</span><select value={client} onChange={(event) => setClient(event.target.value)}><option value="">Todos os clientes</option>{clients.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="cash-forecast-message">{message}</div> : null}

        <div className="cash-forecast-kpis">
          <article><span>Total em aberto</span><strong>{money(summary.outstanding)}</strong><small>saldo atual de recebíveis</small></article>
          <article className={summary.overdue > 0 ? "danger" : "good"}><span>Vencido</span><strong>{money(summary.overdue)}</strong><small>{summary.overdueCount} parcela(s) · {percent(summary.overdueRatio)} do aberto</small></article>
          <article><span>Previsto no horizonte</span><strong>{money(summary.horizonAmount)}</strong><small>{summary.horizonCount} vencimento(s) nos próximos {horizon} dias</small></article>
          <article><span>Recebido no mês</span><strong>{money(summary.receivedMonth)}</strong><small>somatório dos eventos do razão financeiro</small></article>
          <article className={concentration !== null && concentration >= 60 ? "warning" : ""}><span>Concentração Top 3</span><strong>{percent(concentration)}</strong><small>participação dos 3 maiores saldos em aberto</small></article>
          <article className={summary.noDueCount || summary.fallback ? "warning" : "good"}><span>Qualidade do forecast</span><strong>{summary.noDueCount + summary.fallback}</strong><small>{summary.noDueCount} sem vencimento · {summary.fallback} faturamento(s) sem parcelas</small></article>
        </div>

        <div className="cash-forecast-grid">
          <section className="cash-forecast-card">
            <header><div><small>AGENDA</small><h3>Entradas previstas por mês</h3></div><strong>6 meses</strong></header>
            <div className="cash-month-chart">
              {monthly.map((item) => <div className="cash-month" key={item.key}>
                <div className="cash-month-bar"><i style={{ height: `${Math.max(item.amount ? 5 : 0, item.amount / maxMonthly * 100)}%` }} /></div>
                <strong>{money(item.amount)}</strong><span>{item.label}</span>
              </div>)}
            </div>
            <p className="cash-card-note">Valores representam saldos em aberto com vencimento em cada competência. O vencido anterior permanece separado no indicador de atraso.</p>
          </section>

          <section className="cash-forecast-card">
            <header><div><small>AGING</small><h3>Envelhecimento dos recebíveis</h3></div><strong>{money(summary.overdue)}</strong></header>
            <div className="cash-aging-list">
              {aging.map((item) => <article key={item.key} className={item.key === "60+" || item.key === "31-60" ? "danger" : item.key === "8-30" || item.key === "1-7" ? "warning" : ""}>
                <span>{item.label}</span><strong>{money(item.amount)}</strong><small>{item.count} título(s)</small>
              </article>)}
            </div>
          </section>
        </div>

        <section className="cash-forecast-card cash-client-card">
          <header><div><small>RISCO POR CLIENTE</small><h3>Exposição e próximos recebimentos</h3></div><strong>{clientRows.length} cliente(s)</strong></header>
          <div className="cash-client-table">
            <div className="head"><span>Cliente</span><span>Em aberto</span><span>Vencido</span><span>Próx. 30 dias</span><span>Recebido mês</span><span>Maior atraso</span><span>Risco</span></div>
            {clientRows.length ? clientRows.map((item) => <div className="row" key={item.name}>
              <div><strong>{item.name}</strong><small>{item.openCount} título(s) em aberto</small></div>
              <strong>{money(item.outstanding)}</strong><span className={item.overdue > 0 ? "bad" : ""}>{money(item.overdue)}</span><span>{money(item.next30)}</span><span>{money(item.receivedMonth)}</span><span>{item.oldestDays ? `${item.oldestDays} dias` : "—"}</span><b className={item.risk.className}>{item.risk.label}</b>
            </div>) : <p className="empty">Nenhum saldo ou recebimento encontrado.</p>}
          </div>
        </section>

        <section className="cash-forecast-card cash-agenda-card">
          <header><div><small>PRÓXIMAS AÇÕES</small><h3>Agenda de cobrança e recebimento</h3></div><strong>{agenda.length} título(s)</strong></header>
          <div className="cash-agenda-table">
            <div className="head"><span>Faturamento</span><span>Cliente</span><span>Vencimento</span><span>Saldo</span><span>Situação</span><span>Origem</span></div>
            {agenda.map((item) => {
              const late = daysLate(item.dueDate);
              const overdue = Boolean(item.dueDate && item.dueDate < localDateKey());
              return <div className="row" key={item.id}>
                <div><strong>{item.billingNumber}</strong><small>{item.installmentNumber ? `Parcela ${item.installmentNumber}` : item.saleNumber}</small></div>
                <span>{item.companyName}</span><span>{shortDate(item.dueDate)}</span><strong>{money(item.openAmount)}</strong><b className={overdue ? "danger" : !item.dueDate ? "warning" : "good"}>{overdue ? `Vencido há ${late} dia(s)` : !item.dueDate ? "Sem vencimento" : "A vencer"}</b><span>{item.source === "receivable" ? "Parcela" : "Faturamento sem parcelas"}</span>
              </div>;
            })}
          </div>
        </section>

        <footer className="cash-forecast-footer">
          <span>Forecast contratual: não aplica probabilidade artificial de recebimento.</span>
          <span>{payload?.dataQuality.legacySnapshotEvents ? `${payload.dataQuality.legacySnapshotEvents} evento(s) anterior(es) foram preservados como snapshot legado; novos pagamentos ficam individualizados por data.` : "O realizado mensal já usa o razão financeiro por eventos."}</span>
        </footer>
      </section>
    </div> : null}
  </>;
}
