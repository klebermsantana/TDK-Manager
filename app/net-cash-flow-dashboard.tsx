"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Movement = {
  id: string;
  type: "inflow" | "outflow";
  source: "receivable" | "billing" | "payable";
  document: string;
  counterpart: string;
  detail: string;
  dueDate: string | null;
  scheduledAmount: number;
  realizedAmount: number;
  paymentDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type Payload = {
  movements: Movement[];
  dataQuality: {
    billingsWithoutInstallments: number;
    billingsWithoutDueDate: number;
    receivedWithoutPaymentDate: number;
    paidWithoutPaymentDate: number;
  };
};

type Horizon = "30" | "60" | "90";

type DayRow = {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulative: number;
};

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

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

function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00`));
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
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

function tone(value: number) {
  return value < 0 ? "danger" : value > 0 ? "good" : "";
}

export function NetCashFlowDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [horizon, setHorizon] = useState<Horizon>("30");
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
      const response = await fetch("/api/net-cash-flow", { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      if (!response.ok) {
        setMessage("Não foi possível calcular o fluxo de caixa líquido.");
        return;
      }
      setPayload(await response.json() as Payload);
      setAuthorized(true);
      setMessage("");
    } catch {
      setMessage("Não foi possível calcular o fluxo de caixa líquido.");
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

  const summary = useMemo(() => {
    const movements = payload?.movements ?? [];
    const today = localDateKey();
    const limit = addDaysKey(Number(horizon));
    const currentMonth = monthKey();

    const openInflows = movements.filter((item) => item.type === "inflow" && item.scheduledAmount > 0);
    const openOutflows = movements.filter((item) => item.type === "outflow" && item.scheduledAmount > 0);
    const overdueInflows = openInflows.filter((item) => item.dueDate && item.dueDate < today);
    const overdueOutflows = openOutflows.filter((item) => item.dueDate && item.dueDate < today);
    const futureInflows = openInflows.filter((item) => item.dueDate && item.dueDate >= today && item.dueDate <= limit);
    const horizonOutflows = openOutflows.filter((item) => item.dueDate && item.dueDate <= limit);

    const projectedInflow = futureInflows.reduce((sum, item) => sum + item.scheduledAmount, 0);
    const projectedOutflow = horizonOutflows.reduce((sum, item) => sum + item.scheduledAmount, 0);
    const overdueReceivables = overdueInflows.reduce((sum, item) => sum + item.scheduledAmount, 0);
    const overduePayables = overdueOutflows.reduce((sum, item) => sum + item.scheduledAmount, 0);
    const realizedInflow = movements
      .filter((item) => item.type === "inflow" && item.paymentDate?.startsWith(currentMonth))
      .reduce((sum, item) => sum + item.realizedAmount, 0);
    const realizedOutflow = movements
      .filter((item) => item.type === "outflow" && item.paymentDate?.startsWith(currentMonth))
      .reduce((sum, item) => sum + item.realizedAmount, 0);

    return {
      projectedInflow,
      projectedOutflow,
      projectedNet: projectedInflow - projectedOutflow,
      overdueReceivables,
      overduePayables,
      realizedInflow,
      realizedOutflow,
      realizedNet: realizedInflow - realizedOutflow,
      overdueReceivableCount: overdueInflows.length,
      overduePayableCount: overdueOutflows.length,
    };
  }, [payload, horizon]);

  const daily = useMemo(() => {
    const movements = payload?.movements ?? [];
    const today = localDateKey();
    const limit = addDaysKey(Number(horizon));
    const map = new Map<string, { inflow: number; outflow: number }>();
    const ensure = (date: string) => {
      const current = map.get(date) ?? { inflow: 0, outflow: 0 };
      map.set(date, current);
      return current;
    };

    movements.forEach((item) => {
      if (item.scheduledAmount <= 0 || !item.dueDate) return;
      if (item.type === "inflow") {
        if (item.dueDate < today || item.dueDate > limit) return;
        ensure(item.dueDate).inflow += item.scheduledAmount;
        return;
      }
      if (item.dueDate > limit) return;
      const date = item.dueDate < today ? today : item.dueDate;
      ensure(date).outflow += item.scheduledAmount;
    });

    let cumulative = 0;
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => {
        const net = values.inflow - values.outflow;
        cumulative += net;
        return { date, ...values, net, cumulative } as DayRow;
      });
  }, [payload, horizon]);

  const cashNeed = useMemo(() => {
    const minimum = daily.reduce((min, item) => Math.min(min, item.cumulative), 0);
    return Math.max(0, -minimum);
  }, [daily]);

  const endingNet = daily.at(-1)?.cumulative ?? 0;

  const monthly = useMemo(() => {
    const movements = payload?.movements ?? [];
    const today = localDateKey();
    const current = monthKey();
    const keys = futureMonths(6);
    return keys.map((key) => {
      const inflow = movements
        .filter((item) => item.type === "inflow" && item.scheduledAmount > 0 && item.dueDate && item.dueDate >= today && item.dueDate.startsWith(key))
        .reduce((sum, item) => sum + item.scheduledAmount, 0);
      const outflow = movements
        .filter((item) => item.type === "outflow" && item.scheduledAmount > 0 && item.dueDate && (item.dueDate.startsWith(key) || (key === current && item.dueDate < today)))
        .reduce((sum, item) => sum + item.scheduledAmount, 0);
      return { key, inflow, outflow, net: inflow - outflow };
    });
  }, [payload]);

  const pressureDates = useMemo(
    () => [...daily].filter((item) => item.outflow > item.inflow).sort((a, b) => a.net - b.net).slice(0, 8),
    [daily],
  );

  const largestMovements = useMemo(() => {
    const today = localDateKey();
    const limit = addDaysKey(Number(horizon));
    return (payload?.movements ?? [])
      .filter((item) => item.scheduledAmount > 0 && item.dueDate && (item.type === "outflow" ? item.dueDate <= limit : item.dueDate >= today && item.dueDate <= limit))
      .sort((a, b) => b.scheduledAmount - a.scheduledAmount)
      .slice(0, 10);
  }, [payload, horizon]);

  const qualityIssues = payload
    ? payload.dataQuality.billingsWithoutInstallments + payload.dataQuality.billingsWithoutDueDate + payload.dataQuality.receivedWithoutPaymentDate + payload.dataQuality.paidWithoutPaymentDate
    : 0;

  if (!target || authorized !== true) return null;

  return <>
    {createPortal(
      <button type="button" className="net-cash-trigger" onClick={() => setOpen(true)}>
        <span>FLUXO LÍQUIDO</span>
        <strong>{money(summary.projectedNet)}</strong>
        <small>próximos {horizon} dias</small>
      </button>,
      target,
    )}

    {open ? <div className="net-cash-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="net-cash-dashboard" role="dialog" aria-modal="true" aria-label="Fluxo de caixa líquido">
        <header className="net-cash-header">
          <div>
            <small>FINANCEIRO · TESOURARIA</small>
            <h2>Fluxo de caixa líquido</h2>
            <p>Entradas previstas menos saídas previstas. Recebíveis vencidos ficam fora da projeção de entrada; contas a pagar vencidas pressionam o caixa imediatamente.</p>
          </div>
          <div className="net-cash-actions">
            <label><span>Horizonte</span><select value={horizon} onChange={(event) => setHorizon(event.target.value as Horizon)}><option value="30">30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option></select></label>
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="net-cash-message">{message}</div> : null}

        <div className="net-cash-kpis">
          <article><span>Entradas previstas</span><strong>{money(summary.projectedInflow)}</strong><small>recebíveis a vencer no horizonte</small></article>
          <article><span>Saídas previstas</span><strong>{money(summary.projectedOutflow)}</strong><small>inclui contas vencidas ainda não pagas</small></article>
          <article className={tone(summary.projectedNet)}><span>Saldo líquido projetado</span><strong>{money(summary.projectedNet)}</strong><small>movimentação líquida do período</small></article>
          <article className={cashNeed > 0 ? "danger" : "good"}><span>Necessidade acumulada</span><strong>{money(cashNeed)}</strong><small>{cashNeed > 0 ? "pico de caixa necessário para cobrir saídas" : "sem déficit acumulado no cenário"}</small></article>
          <article className={summary.overdueReceivables > 0 ? "warning" : "good"}><span>Recebíveis vencidos</span><strong>{money(summary.overdueReceivables)}</strong><small>{summary.overdueReceivableCount} título(s) fora da projeção de entrada</small></article>
          <article className={summary.overduePayables > 0 ? "danger" : "good"}><span>Pagamentos vencidos</span><strong>{money(summary.overduePayables)}</strong><small>{summary.overduePayableCount} obrigação(ões) tratada(s) como imediatas</small></article>
          <article className={tone(summary.realizedNet)}><span>Realizado líquido no mês</span><strong>{money(summary.realizedNet)}</strong><small>{money(summary.realizedInflow)} entrou · {money(summary.realizedOutflow)} saiu</small></article>
          <article className={qualityIssues ? "warning" : "good"}><span>Qualidade dos dados</span><strong>{qualityIssues}</strong><small>pendência(s) que podem afetar a leitura</small></article>
        </div>

        <div className="net-cash-grid">
          <section className="net-cash-card wide">
            <header><div><small>PROJEÇÃO</small><h3>Entradas x saídas por mês</h3></div><strong>6 meses</strong></header>
            <div className="net-cash-months">
              {monthly.map((item) => <article key={item.key} className={tone(item.net)}>
                <strong>{monthLabel(item.key)}</strong>
                <span>Entradas <b>{money(item.inflow)}</b></span>
                <span>Saídas <b>{money(item.outflow)}</b></span>
                <span className="net">Líquido <b>{money(item.net)}</b></span>
              </article>)}
            </div>
          </section>

          <section className="net-cash-card">
            <header><div><small>PRESSÃO DE CAIXA</small><h3>Datas mais críticas</h3></div><strong>{money(cashNeed)}</strong></header>
            {pressureDates.length ? <div className="net-cash-table-wrap"><table><thead><tr><th>Data</th><th>Entradas</th><th>Saídas</th><th>Líquido</th><th>Acumulado</th></tr></thead><tbody>{pressureDates.map((item) => <tr key={item.date}><td>{shortDate(item.date)}</td><td>{money(item.inflow)}</td><td>{money(item.outflow)}</td><td className={tone(item.net)}>{money(item.net)}</td><td className={tone(item.cumulative)}>{money(item.cumulative)}</td></tr>)}</tbody></table></div> : <p className="net-cash-empty">Nenhuma data com saída superior à entrada no horizonte selecionado.</p>}
          </section>

          <section className="net-cash-card">
            <header><div><small>EXPOSIÇÃO</small><h3>Maiores movimentos futuros</h3></div><strong>{money(endingNet)}</strong></header>
            {largestMovements.length ? <div className="net-cash-movement-list">{largestMovements.map((item) => <article key={item.id} className={item.type}><div><strong>{item.counterpart}</strong><small>{item.document} · {item.detail}</small></div><span><b>{item.type === "inflow" ? "+" : "−"}{money(item.scheduledAmount)}</b><small>{item.dueDate ? shortDate(item.dueDate) : "Sem vencimento"}</small></span></article>)}</div> : <p className="net-cash-empty">Sem movimentos previstos no horizonte selecionado.</p>}
          </section>

          <section className="net-cash-card wide">
            <header><div><small>CONTROLE</small><h3>Qualidade e premissas</h3></div><strong>{qualityIssues ? "Revisar" : "OK"}</strong></header>
            <div className="net-cash-quality">
              <span>Faturamentos sem parcelas <b>{payload?.dataQuality.billingsWithoutInstallments ?? 0}</b></span>
              <span>Faturamentos sem vencimento <b>{payload?.dataQuality.billingsWithoutDueDate ?? 0}</b></span>
              <span>Recebimentos sem data <b>{payload?.dataQuality.receivedWithoutPaymentDate ?? 0}</b></span>
              <span>Pagamentos sem data <b>{payload?.dataQuality.paidWithoutPaymentDate ?? 0}</b></span>
            </div>
            <p className="net-cash-note">O acumulado parte de zero e representa somente a movimentação líquida prevista. Ele ainda não é saldo bancário. Para isso, numa próxima etapa, podemos integrar saldo inicial e contas bancárias.</p>
          </section>
        </div>
      </section>
    </div> : null}
  </>;
}
