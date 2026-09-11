"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type ClosingAccount = {
  accountId: number;
  accountName: string;
  bankName: string | null;
  balanceDate: string;
  baseBalance: number;
  ledgerNet: number;
  ledgerEventCount: number;
  bookBalance: number;
  statementNet: number;
  statementTransactionCount: number;
  statementBalance: number | null;
  statementBalanceDate: string | null;
  statementBalanceCurrent: boolean;
  latestImportPeriodEnd: string | null;
  statementCovered: boolean;
  movementDifference: number;
  closingDifference: number | null;
  reconciliationCoverage: number;
  fullyAllocatedCount: number;
  unallocatedCount: number;
  unallocatedAmount: number;
  unknownLedgerEventCount: number;
  unknownLedgerAmount: number;
  ready: boolean;
  issues: string[];
};

type ClosingPayload = {
  date: string;
  accounts: ClosingAccount[];
  summary: {
    activeAccounts: number;
    readyAccounts: number;
    bookBalance: number;
    statementBalance: number;
    comparableAccounts: number;
    closingDifference: number;
    unallocatedStatementAmount: number;
    unallocatedStatementCount: number;
    unknownLedgerEventCount: number;
    unknownLedgerAmount: number;
  };
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "—";
const percent = (value: number) => `${value.toFixed(0)}%`;
const differenceClass = (value: number | null) => value === null ? "warning" : Math.abs(value) <= 0.01 ? "good" : "danger";

export function TreasuryClosingDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(localDateKey());
  const [payload, setPayload] = useState<ClosingPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const locate = () => setTarget(document.querySelector<HTMLElement>(".treasury-actions"));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function refresh(silent = false, requestedDate = date) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/treasury-closing?date=${encodeURIComponent(requestedDate)}`, { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as ClosingPayload & { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível conferir o fechamento.");
        return;
      }
      setPayload(result);
      setAuthorized(true);
      setMessage("");
    } catch {
      setMessage("Não foi possível conferir o fechamento.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (target && authorized === null) void refresh(true);
  }, [target, authorized]);

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  const priorities = useMemo(() => (payload?.accounts ?? [])
    .filter((account) => !account.ready)
    .sort((a, b) => {
      const diffA = Math.abs(a.closingDifference ?? 0) + a.unallocatedAmount + a.unknownLedgerAmount;
      const diffB = Math.abs(b.closingDifference ?? 0) + b.unallocatedAmount + b.unknownLedgerAmount;
      return diffB - diffA;
    }), [payload]);

  if (!target || authorized === false) return null;

  const summary = payload?.summary;
  const trigger = <button type="button" className="treasury-closing-trigger" onClick={() => setOpen(true)} disabled={authorized === null}>
    <span>FECHAMENTO</span>
    <strong>{summary ? `${summary.readyAccounts}/${summary.activeAccounts}` : "Conferir"}</strong>
    <small>contas prontas</small>
  </button>;

  return <>
    {createPortal(trigger, target)}
    {open ? <div className="treasury-closing-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-closing-dashboard" role="dialog" aria-modal="true" aria-label="Conferência de fechamento da tesouraria">
        <header className="treasury-closing-header">
          <div>
            <small>FINANCEIRO · TESOURARIA</small>
            <h2>Conferência de fechamento</h2>
            <p>Compara saldo-base, razão financeiro, extrato bancário e conciliação antes de considerar uma conta pronta para fechamento.</p>
          </div>
          <div className="treasury-closing-actions">
            <label><span>Data de corte</span><input type="date" value={date} max={localDateKey()} onChange={(event) => setDate(event.target.value)} /></label>
            <button type="button" onClick={() => void refresh(false, date)} disabled={loading || !date}>{loading ? "Conferindo…" : "Conferir"}</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="treasury-closing-message">{message}</div> : null}

        {summary ? <div className="treasury-closing-kpis">
          <article className={summary.readyAccounts === summary.activeAccounts && summary.activeAccounts > 0 ? "good" : "warning"}><span>Contas prontas</span><strong>{summary.readyAccounts}/{summary.activeAccounts}</strong><small>na data de {shortDate(payload?.date ?? date)}</small></article>
          <article><span>Saldo TDK calculado</span><strong>{money(summary.bookBalance)}</strong><small>saldo-base + razão atribuído</small></article>
          <article className={summary.comparableAccounts === summary.activeAccounts ? "" : "warning"}><span>Saldo dos extratos</span><strong>{money(summary.statementBalance)}</strong><small>{summary.comparableAccounts} conta(s) comparável(is)</small></article>
          <article className={differenceClass(summary.comparableAccounts ? summary.closingDifference : null)}><span>Diferença consolidada</span><strong>{summary.comparableAccounts ? money(summary.closingDifference) : "—"}</strong><small>extrato − TDK nas contas comparáveis</small></article>
          <article className={summary.unallocatedStatementAmount > 0.01 ? "danger" : "good"}><span>Extrato sem conciliação</span><strong>{money(summary.unallocatedStatementAmount)}</strong><small>{summary.unallocatedStatementCount} lançamento(s) com saldo pendente</small></article>
          <article className={summary.unknownLedgerEventCount ? "warning" : "good"}><span>Razão sem conta</span><strong>{summary.unknownLedgerEventCount}</strong><small>{money(summary.unknownLedgerAmount)} sem atribuição bancária</small></article>
        </div> : null}

        <section className="treasury-closing-card wide">
          <header><div><small>CONFERÊNCIA POR CONTA</small><h3>Posição de fechamento</h3></div><strong>{payload?.accounts.length ?? 0} conta(s)</strong></header>
          <div className="treasury-closing-table">
            <div className="head"><span>Conta</span><span>Saldo-base</span><span>Razão</span><span>Saldo TDK</span><span>Extrato</span><span>Diferença</span><span>Conciliação</span><span>Status</span></div>
            {(payload?.accounts ?? []).map((account) => <div className="treasury-closing-account" key={account.accountId}>
              <button type="button" className="row" onClick={() => setExpanded(expanded === account.accountId ? null : account.accountId)}>
                <div><strong>{account.accountName}</strong><small>{account.bankName ?? "Conta bancária"} · base {shortDate(account.balanceDate)}</small></div>
                <span>{money(account.baseBalance)}</span>
                <span className={account.ledgerNet < 0 ? "bad" : account.ledgerNet > 0 ? "good-text" : ""}>{account.ledgerNet >= 0 ? "+" : ""}{money(account.ledgerNet)}</span>
                <strong>{money(account.bookBalance)}</strong>
                <span>{account.statementBalance === null ? "Sem saldo" : money(account.statementBalance)}</span>
                <strong className={differenceClass(account.closingDifference)}>{account.closingDifference === null ? "—" : money(account.closingDifference)}</strong>
                <span>{percent(account.reconciliationCoverage)}</span>
                <b className={account.ready ? "good" : "warning"}>{account.ready ? "Pronta" : "Revisar"}</b>
              </button>
              {expanded === account.accountId ? <div className="details">
                <div className="detail-grid">
                  <article><span>Movimento no extrato</span><strong>{money(account.statementNet)}</strong><small>{account.statementTransactionCount} lançamento(s) após o saldo-base</small></article>
                  <article><span>Movimento no razão</span><strong>{money(account.ledgerNet)}</strong><small>{account.ledgerEventCount} evento(s) atribuído(s)</small></article>
                  <article className={differenceClass(account.movementDifference)}><span>Diferença de movimentos</span><strong>{money(account.movementDifference)}</strong><small>extrato − razão no período</small></article>
                  <article className={account.unallocatedAmount > 0.01 ? "danger" : "good"}><span>Não conciliado</span><strong>{money(account.unallocatedAmount)}</strong><small>{account.unallocatedCount} lançamento(s) pendente(s)</small></article>
                  <article className={!account.statementCovered ? "warning" : "good"}><span>Cobertura do extrato</span><strong>{shortDate(account.latestImportPeriodEnd)}</strong><small>{account.statementCovered ? "cobre a data de corte" : "extrato precisa ser atualizado"}</small></article>
                  <article className={account.unknownLedgerEventCount ? "warning" : "good"}><span>Razão sem conta</span><strong>{account.unknownLedgerEventCount}</strong><small>{money(account.unknownLedgerAmount)} potencialmente não atribuído</small></article>
                </div>
                <div className="treasury-closing-issues">
                  <strong>{account.ready ? "Conferência concluída" : "Pendências para fechamento"}</strong>
                  {account.ready ? <p>Extrato coberto, saldo consistente, razão atribuído e conciliação sem saldo pendente.</p> : account.issues.map((issue) => <p key={issue}>• {issue}</p>)}
                  <small>Último saldo do extrato: {shortDate(account.statementBalanceDate)} · {account.statementBalanceCurrent ? "posição utilizável" : "posição incompleta ou desatualizada"}.</small>
                </div>
              </div> : null}
            </div>)}
            {!payload?.accounts.length ? <p className="empty">Nenhuma conta bancária ativa encontrada.</p> : null}
          </div>
        </section>

        {priorities.length ? <section className="treasury-closing-card">
          <header><div><small>PRIORIDADES</small><h3>O que impede o fechamento</h3></div><strong>{priorities.length} conta(s)</strong></header>
          <div className="treasury-closing-priorities">
            {priorities.map((account) => <article key={account.accountId}>
              <div><strong>{account.accountName}</strong><small>{account.issues[0] ?? "Revisar conferência"}</small></div>
              <span className={differenceClass(account.closingDifference)}>{account.closingDifference === null ? "Sem comparação" : money(account.closingDifference)}</span>
            </article>)}
          </div>
        </section> : <section className="treasury-closing-card success-card"><strong>Fechamento conferido</strong><p>Todas as contas ativas atendem aos critérios técnicos para a data selecionada.</p></section>}

        <footer className="treasury-closing-footer">
          <span>“Pronta” significa conferência técnica concluída; esta etapa ainda não bloqueia lançamentos nem cria fechamento contábil definitivo.</span>
          <span>Diferença tolerada: R$ 0,01 por conta.</span>
        </footer>
      </section>
    </div> : null}
  </>;
}
