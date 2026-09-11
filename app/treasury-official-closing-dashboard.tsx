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
  snapshotSource: string;
  notes: string | null;
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

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "—";
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

export function TreasuryOfficialClosingDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(localDateKey());
  const [diagnostics, setDiagnostics] = useState<DiagnosticPayload | null>(null);
  const [official, setOfficial] = useState<OfficialPayload | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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
        setMessage(diagnosticPayload.error ?? officialPayload.error ?? "Não foi possível carregar o fechamento oficial.");
        return;
      }
      setDiagnostics(diagnosticPayload);
      setOfficial(officialPayload);
      setAuthorized(true);
      setMessage("");
    } catch {
      setMessage("Não foi possível carregar o fechamento oficial.");
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

  useEffect(() => {
    const openFromCalendar = (event: Event) => {
      const requestedDate = (event as CustomEvent<{ date?: string }>).detail?.date;
      if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate <= localDateKey()) setDate(requestedDate);
      setOpen(true);
    };
    window.addEventListener("tdk:open-treasury-official-closing", openFromCalendar);
    return () => window.removeEventListener("tdk:open-treasury-official-closing", openFromCalendar);
  }, []);

  const activeByAccount = useMemo(() => new Map((official?.latestActive ?? []).map((item) => [item.bankAccountId, item])), [official]);
  const readyToClose = useMemo(() => (diagnostics?.accounts ?? []).filter((account) => {
    if (!account.ready) return false;
    const active = activeByAccount.get(account.accountId);
    return !active || date > active.closingDate;
  }), [diagnostics, activeByAccount, date]);

  async function closeAccount(account: DiagnosticAccount) {
    if (!window.confirm(`Confirmar o fechamento oficial de ${account.accountName} em ${shortDate(date)}?\n\nApós fechar, lançamentos financeiros e conciliações retroativas ficarão bloqueados até uma reabertura auditada.`)) return;
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-official-closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankAccountId: account.accountId, closingDate: date, notes }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; issues?: string[] };
      if (!response.ok) {
        setMessage(result.issues?.length ? `${result.error} ${result.issues.join(" ")}` : result.error ?? "Não foi possível fechar a conta.");
        return;
      }
      setMessage(`${account.accountName} fechada oficialmente em ${shortDate(date)}.`);
      await refresh(true, date);
    } finally {
      setLoading(false);
    }
  }

  async function closeAll() {
    if (!readyToClose.length) return;
    if (!window.confirm(`Fechar oficialmente ${readyToClose.length} conta(s) prontas em ${shortDate(date)}?\n\nSomente as contas que passaram em todos os critérios técnicos serão fechadas.`)) return;
    setLoading(true);
    let closed = 0;
    const failures: string[] = [];
    try {
      for (const account of readyToClose) {
        const response = await fetch("/api/treasury-official-closing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bankAccountId: account.accountId, closingDate: date, notes }),
        });
        if (response.ok) closed += 1;
        else {
          const result = await response.json().catch(() => ({})) as { error?: string };
          failures.push(`${account.accountName}: ${result.error ?? "falha"}`);
        }
      }
      setMessage(`${closed} conta(s) fechada(s).${failures.length ? ` ${failures.length} falha(s): ${failures.join(" | ")}` : ""}`);
      await refresh(true, date);
    } finally {
      setLoading(false);
    }
  }

  async function reopen(record: ClosingRecord) {
    const reason = window.prompt(`Motivo da reabertura de ${record.accountName} (${shortDate(record.closingDate)}):`);
    if (!reason) return;
    if (reason.trim().length < 5) {
      setMessage("Informe um motivo de reabertura com pelo menos 5 caracteres.");
      return;
    }
    if (!window.confirm(`Reabrir oficialmente ${record.accountName} até ${shortDate(record.closingDate)}?\n\nA reabertura ficará registrada com seu usuário e justificativa.`)) return;
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-official-closing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id, reason: reason.trim() }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível reabrir o fechamento.");
        return;
      }
      setMessage(`${record.accountName} reaberta. A auditoria da reabertura foi registrada.`);
      await refresh(true, date);
    } finally {
      setLoading(false);
    }
  }

  if (!target || authorized === false) return null;

  const activeClosings = official?.latestActive ?? [];
  const history = official?.records ?? [];

  return <>
    {createPortal(<button type="button" className="treasury-official-trigger" onClick={() => setOpen(true)} disabled={authorized === null}>
      <span>OFICIAL</span>
      <strong>{activeClosings.length}</strong>
      <small>fechamento(s) ativo(s)</small>
    </button>, target)}

    {open ? <div className="treasury-official-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-official-dashboard" role="dialog" aria-modal="true" aria-label="Fechamento oficial da tesouraria">
        <header className="treasury-official-header">
          <div><small>FINANCEIRO · TESOURARIA</small><h2>Fechamento oficial</h2><p>Registra um snapshot imutável da conferência e bloqueia alterações retroativas enquanto o fechamento permanecer ativo.</p></div>
          <div className="treasury-official-actions">
            <label><span>Data de fechamento</span><input type="date" value={date} max={localDateKey()} onChange={(event) => setDate(event.target.value)} /></label>
            <button type="button" onClick={() => void refresh(false, date)} disabled={loading}>{loading ? "Atualizando…" : "Conferir"}</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar painel</button>
          </div>
        </header>

        {message ? <div className="treasury-official-message">{message}</div> : null}

        <div className="treasury-official-kpis">
          <article><span>Fechamentos ativos</span><strong>{activeClosings.length}</strong><small>protegem períodos retroativos</small></article>
          <article className={readyToClose.length ? "good" : "warning"}><span>Prontas agora</span><strong>{readyToClose.length}</strong><small>na data de {shortDate(date)}</small></article>
          <article><span>Histórico</span><strong>{history.length}</strong><small>fechamentos e reaberturas preservados</small></article>
          <article><span>Diferença tolerada</span><strong>R$ 0,01</strong><small>por conta no momento do fechamento</small></article>
        </div>

        <section className="treasury-official-card wide">
          <header><div><small>CONTAS DA DATA</small><h3>Fechar contas conferidas</h3></div><button type="button" className="primary" disabled={loading || !readyToClose.length} onClick={() => void closeAll()}>Fechar todas prontas</button></header>
          <label className="treasury-official-notes"><span>Observação do fechamento (opcional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: fechamento diário conferido com extrato Itaú e Santander." rows={2} /></label>
          <div className="treasury-official-list">
            {(diagnostics?.accounts ?? []).map((account) => {
              const active = activeByAccount.get(account.accountId);
              const canClose = account.ready && (!active || date > active.closingDate);
              return <article key={account.accountId} className={account.ready ? "ready" : "review"}>
                <div><strong>{account.accountName}</strong><small>{account.bankName ?? "Conta bancária"} · TDK {money(account.bookBalance)} · Extrato {account.statementBalance === null ? "—" : money(account.statementBalance)}</small></div>
                <div><span>Diferença</span><b>{account.closingDifference === null ? "—" : money(account.closingDifference)}</b><small>Conciliação {account.reconciliationCoverage.toFixed(0)}%</small></div>
                <div className="status"><b>{account.ready ? "Conferida" : "Revisar"}</b>{active ? <small>fechada até {shortDate(active.closingDate)}</small> : null}</div>
                {canClose ? <button type="button" onClick={() => void closeAccount(account)} disabled={loading}>Fechar oficialmente</button> : <button type="button" disabled>{active && date <= active.closingDate ? "Já protegida" : "Pendências"}</button>}
                {!account.ready && account.issues.length ? <p>{account.issues[0]}</p> : null}
              </article>;
            })}
            {!diagnostics?.accounts.length ? <p className="empty">Nenhuma conta ativa para esta data.</p> : null}
          </div>
        </section>

        <section className="treasury-official-card">
          <header><div><small>PROTEÇÃO ATIVA</small><h3>Períodos atualmente fechados</h3></div><strong>{activeClosings.length}</strong></header>
          <div className="treasury-official-active">
            {activeClosings.map((record) => <article key={record.id}>
              <div><strong>{record.accountName}</strong><small>Fechada até {shortDate(record.closingDate)} por {record.closedBy}</small></div>
              <div><b>{money(record.bookBalance)}</b><small>snapshot TDK · {record.reconciliationCoverage.toFixed(0)}% conciliado</small></div>
              <button type="button" onClick={() => void reopen(record)} disabled={loading}>Reabrir com auditoria</button>
            </article>)}
            {!activeClosings.length ? <p className="empty">Nenhum período oficialmente fechado.</p> : null}
          </div>
        </section>

        <section className="treasury-official-card wide">
          <header><div><small>HISTÓRICO</small><h3>Snapshots e reaberturas</h3></div><strong>{history.length} registro(s)</strong></header>
          <div className="treasury-official-history">
            <div className="head"><span>Conta</span><span>Data</span><span>Saldo TDK</span><span>Extrato</span><span>Diferença</span><span>Status</span><span>Responsável</span></div>
            {history.slice(0, 40).map((record) => <div className="row" key={record.id}>
              <span><strong>{record.accountName}</strong><small>{record.bankName ?? "Conta bancária"}</small></span>
              <span>{shortDate(record.closingDate)}</span><span>{money(record.bookBalance)}</span><span>{money(record.statementBalance)}</span><span>{money(record.closingDifference)}</span>
              <span><b className={record.status === "closed" ? "closed" : "reopened"}>{record.status === "closed" ? "Fechado" : "Reaberto"}</b>{record.reopenReason ? <small>{record.reopenReason}</small> : null}</span>
              <span><small>{record.status === "closed" ? record.closedBy : record.reopenedBy}</small><small>{record.status === "closed" ? dateTime(record.closedAt) : dateTime(record.reopenedAt)}</small></span>
            </div>)}
          </div>
        </section>

        <footer className="treasury-official-footer"><span>Fechar oficialmente cria um snapshot histórico e ativa bloqueios de baixa, conciliação, rateio, importação retroativa de extrato e reclassificação bancária do período.</span><span>Para corrigir um período fechado, reabra primeiro o fechamento mais recente da conta e informe a justificativa.</span></footer>
      </section>
    </div> : null}
  </>;
}
