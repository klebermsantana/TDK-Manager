"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type LedgerEvent = {
  id: number;
  movementType: string;
  movementId: number;
  direction: "inflow" | "outflow";
  eventType: string;
  amount: number;
  eventDate: string;
  source: string;
  bankAccountId: number | null;
  bankAccountName: string | null;
  bankName: string | null;
  statementTransactionId: number | null;
  bankDescription: string | null;
  performedBy: string;
  notes: string | null;
  document: string;
  counterpart: string;
  detail: string;
  createdAt: string;
};

type Payload = {
  events: LedgerEvent[];
  accounts: Array<{ id: number; name: string; bankName: string | null }>;
  summary: { totalEvents: number; legacySnapshots: number; reconciliationEvents: number; manualEvents: number };
};

type Period = "30" | "90" | "365" | "all";

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const shortDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(`${value}T12:00:00`));

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startDateFor(period: Period) {
  if (period === "all") return null;
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - Number(period));
  return localDateKey(date);
}

function eventLabel(type: string) {
  if (type === "legacy_snapshot") return "Snapshot legado";
  if (type === "reversal") return "Estorno";
  if (type === "adjustment") return "Ajuste";
  return "Pagamento";
}

function sourceLabel(source: string) {
  if (source === "reconciliation") return "Conciliação";
  if (source === "legacy_snapshot") return "Legado";
  return "Manual";
}

export function FinancialLedgerDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<Period>("90");
  const [direction, setDirection] = useState("all");
  const [accountId, setAccountId] = useState("");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
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
      const response = await fetch("/api/financial-ledger", { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível carregar o razão financeiro.");
        return;
      }
      setPayload(result);
      setAuthorized(true);
      setMessage("");
    } catch {
      setMessage("Não foi possível carregar o razão financeiro.");
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

  const rows = useMemo(() => {
    const start = startDateFor(period);
    const term = search.trim().toLowerCase();
    return (payload?.events ?? [])
      .filter((item) => !start || item.eventDate >= start)
      .filter((item) => direction === "all" || item.direction === direction)
      .filter((item) => !accountId || String(item.bankAccountId ?? "") === accountId)
      .filter((item) => source === "all" || item.source === source)
      .filter((item) => !term || `${item.document} ${item.counterpart} ${item.detail} ${item.bankDescription ?? ""} ${item.performedBy}`.toLowerCase().includes(term));
  }, [payload, period, direction, accountId, source, search]);

  const summary = useMemo(() => {
    const inflow = rows.filter((item) => item.direction === "inflow").reduce((sum, item) => sum + Number(item.amount), 0);
    const outflow = rows.filter((item) => item.direction === "outflow").reduce((sum, item) => sum + Number(item.amount), 0);
    const reversals = rows.filter((item) => item.eventType === "reversal" || item.amount < 0).length;
    const legacy = rows.filter((item) => item.eventType === "legacy_snapshot").length;
    return { inflow, outflow, net: inflow - outflow, reversals, legacy, count: rows.length };
  }, [rows]);

  if (!target || authorized !== true) return null;

  return <>
    {createPortal(
      <button type="button" className="ledger-trigger" onClick={() => setOpen(true)}>
        <span>RAZÃO</span>
        <strong>Financeiro</strong>
        <small>{payload ? `${payload.summary.totalEvents} evento(s) registrados` : "recebimentos + pagamentos"}</small>
      </button>,
      target,
    )}

    {open ? <div className="ledger-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="ledger-dashboard" role="dialog" aria-modal="true" aria-label="Razão financeiro">
        <header className="ledger-header">
          <div>
            <small>FINANCEIRO · AUDITORIA</small>
            <h2>Razão financeiro</h2>
            <p>Cada recebimento, pagamento, ajuste e estorno fica registrado por data. Os valores acumulados dos títulos continuam controlando o saldo atual; o razão explica o realizado por período.</p>
          </div>
          <div className="ledger-actions">
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="ledger-message">{message}</div> : null}

        <div className="ledger-filters">
          <label><span>Período</span><select value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Últimos 12 meses</option><option value="all">Todo o histórico</option></select></label>
          <label><span>Movimento</span><select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="all">Entradas e saídas</option><option value="inflow">Entradas</option><option value="outflow">Saídas</option></select></label>
          <label><span>Conta bancária</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Todas</option>{(payload?.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` · ${account.bankName}` : ""}</option>)}</select></label>
          <label><span>Origem</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">Todas</option><option value="manual">Manual</option><option value="reconciliation">Conciliação</option><option value="legacy_snapshot">Legado</option></select></label>
          <label className="search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título, cliente, fornecedor, usuário..." /></label>
        </div>

        <div className="ledger-kpis">
          <article className="good"><span>Entradas realizadas</span><strong>{money(summary.inflow)}</strong><small>líquido de pagamentos e estornos</small></article>
          <article><span>Saídas realizadas</span><strong>{money(summary.outflow)}</strong><small>líquido de pagamentos e estornos</small></article>
          <article className={summary.net < 0 ? "danger" : "good"}><span>Movimento líquido</span><strong>{money(summary.net)}</strong><small>entradas menos saídas</small></article>
          <article><span>Eventos</span><strong>{summary.count}</strong><small>{summary.reversals} estorno(s) · {summary.legacy} snapshot(s) legado(s)</small></article>
        </div>

        <section className="ledger-card">
          <header><div><small>LANÇAMENTOS</small><h3>Histórico detalhado</h3></div><strong>{rows.length}</strong></header>
          <div className="ledger-table">
            <div className="head"><span>Data</span><span>Tipo</span><span>Título / contraparte</span><span>Valor</span><span>Conta</span><span>Origem</span><span>Usuário</span></div>
            {rows.length ? rows.map((item) => <div className="row" key={item.id}>
              <span>{shortDate(item.eventDate)}</span>
              <b className={`${item.direction} ${item.amount < 0 ? "reversal" : ""}`}>{eventLabel(item.eventType)}</b>
              <div><strong>{item.document} · {item.counterpart}</strong><small>{item.detail}{item.bankDescription ? ` · Banco: ${item.bankDescription}` : ""}</small></div>
              <strong className={item.amount < 0 ? "negative" : item.direction === "inflow" ? "positive" : ""}>{item.amount < 0 ? "−" : item.direction === "inflow" ? "+" : "−"}{money(Math.abs(item.amount))}</strong>
              <span>{item.bankAccountName ?? "Sem conta"}{item.bankName ? ` · ${item.bankName}` : ""}</span>
              <span>{sourceLabel(item.source)}</span>
              <span>{item.performedBy}</span>
            </div>) : <p className="ledger-empty">Nenhum evento encontrado com os filtros selecionados.</p>}
          </div>
        </section>

        <footer className="ledger-footer">
          <span>Eventos novos são individualizados; estornos entram como eventos negativos e não apagam o pagamento original.</span>
          <span>{payload?.summary.legacySnapshots ? `${payload.summary.legacySnapshots} registro(s) anterior(es) foram preservados como snapshot legado quando havia data de pagamento disponível.` : "Não há snapshots legados na base carregada."}</span>
        </footer>
      </section>
    </div> : null}
  </>;
}
