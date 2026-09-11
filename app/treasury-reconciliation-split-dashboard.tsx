"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type BankAccount = { id: number; name: string; bankName: string | null; active: boolean };
type Settlement = {
  id: number;
  movementType: string;
  movementId: number;
  settlementAmount: number;
  previousAmount: number;
  resultingAmount: number;
  previousStatus: string;
  resultingStatus: string;
  previousPaymentDate: string | null;
  paymentDate: string;
  settledBy: string;
  createdAt: string;
};
type Candidate = {
  key: string;
  movementType: "receivable" | "billing" | "payable";
  movementId: number;
  direction: "inflow" | "outflow";
  document: string;
  counterpart: string;
  detail: string;
  totalAmount: number;
  remainingAmount: number;
  recordedAmount: number;
  date: string | null;
  bankAccountId: number | null;
  allocatedAmount: number;
  availableAmount: number;
};
type Allocation = {
  id: number;
  statementTransactionId: number;
  movementType: string;
  movementId: number;
  allocatedAmount: number;
  settled: boolean;
  settlement: Settlement | null;
  candidate: Candidate | null;
};
type SplitTransaction = {
  id: number;
  bankAccountId: number;
  transactionDate: string;
  amount: number;
  allocations: Allocation[];
  settlements: Settlement[];
  allocatedAmount: number;
  unallocatedAmount: number;
  fullyAllocated: boolean;
};
type SplitPayload = { candidates: Candidate[]; transactions: SplitTransaction[] };
type ReconciliationTransaction = { id: number; description: string; memo: string | null; document: string | null };
type ReconciliationPayload = { transactions?: ReconciliationTransaction[] };

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "—";
const keyOf = (movementType: string, movementId: number) => `${movementType}:${movementId}`;
const movementLabel = (type: string) => type === "receivable" ? "Receber" : type === "payable" ? "Pagar" : "Faturamento";

export function TreasuryReconciliationSplitDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [payload, setPayload] = useState<SplitPayload | null>(null);
  const [descriptions, setDescriptions] = useState<Record<number, ReconciliationTransaction>>({});
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const locate = () => setTarget(document.querySelector<HTMLElement>(".receivable-metrics"));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function loadAccounts() {
    try {
      const response = await fetch("/api/treasury-accounts", { cache: "no-store" });
      if (response.status === 403) { setAuthorized(false); return; }
      if (!response.ok) return;
      const result = await response.json() as { accounts?: BankAccount[] };
      const active = (result.accounts ?? []).filter((item) => item.active);
      setAccounts(active);
      setAuthorized(true);
      setAccountId((current) => current || (active[0] ? String(active[0].id) : ""));
    } catch { setAuthorized(false); }
  }

  async function refresh(account = accountId, silent = false) {
    if (!account) { setPayload(null); return; }
    if (!silent) setLoading(true);
    try {
      const [splitResponse, reconciliationResponse] = await Promise.all([
        fetch(`/api/treasury-reconciliation-allocations?bankAccountId=${encodeURIComponent(account)}`, { cache: "no-store" }),
        fetch(`/api/treasury-reconciliation?bankAccountId=${encodeURIComponent(account)}`, { cache: "no-store" }),
      ]);
      if (splitResponse.status === 403 || reconciliationResponse.status === 403) { setAuthorized(false); return; }
      const splitResult = await splitResponse.json().catch(() => ({})) as SplitPayload & { error?: string };
      const reconciliationResult = await reconciliationResponse.json().catch(() => ({})) as ReconciliationPayload & { error?: string };
      if (!splitResponse.ok) { setMessage(splitResult.error ?? "Não foi possível carregar os rateios."); return; }
      setPayload(splitResult);
      const nextDescriptions: Record<number, ReconciliationTransaction> = {};
      (reconciliationResult.transactions ?? []).forEach((item) => { nextDescriptions[item.id] = item; });
      setDescriptions(nextDescriptions);
      setSelectedId((current) => current && splitResult.transactions.some((item) => item.id === current) ? current : splitResult.transactions[0]?.id ?? null);
      setMessage("");
    } finally { if (!silent) setLoading(false); }
  }

  useEffect(() => { if (target && authorized === null) void loadAccounts(); }, [target, authorized]);
  useEffect(() => { if (open) void loadAccounts(); }, [open]);
  useEffect(() => { if (open && accountId) void refresh(accountId); }, [open, accountId]);

  const selected = payload?.transactions.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected) { setDraft({}); return; }
    const next: Record<string, string> = {};
    selected.allocations.forEach((item) => { next[keyOf(item.movementType, item.movementId)] = Number(item.allocatedAmount).toFixed(2); });
    setDraft(next);
    setSearch("");
  }, [selectedId, selected?.allocatedAmount]);

  const existingByKey = useMemo(() => new Map((selected?.allocations ?? []).map((item) => [keyOf(item.movementType, item.movementId), item])), [selected]);
  const direction = selected && selected.amount >= 0 ? "inflow" : "outflow";
  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (payload?.candidates ?? [])
      .filter((item) => item.direction === direction)
      .filter((item) => {
        const existing = existingByKey.get(item.key);
        const availableForThis = item.availableAmount + Number(existing?.allocatedAmount ?? 0);
        return availableForThis > 0.009 || Boolean(existing);
      })
      .filter((item) => !term || `${item.document} ${item.counterpart} ${item.detail}`.toLowerCase().includes(term))
      .sort((a, b) => {
        const aExisting = existingByKey.has(a.key) ? 1 : 0;
        const bExisting = existingByKey.has(b.key) ? 1 : 0;
        if (aExisting !== bExisting) return bExisting - aExisting;
        return (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.counterpart.localeCompare(b.counterpart);
      })
      .slice(0, 80);
  }, [payload, direction, search, existingByKey]);

  const draftRows = useMemo(() => Object.entries(draft).map(([key, raw]) => {
    const candidate = payload?.candidates.find((item) => item.key === key) ?? null;
    const amount = Number(String(raw).replace(",", "."));
    return { key, candidate, amount: Number.isFinite(amount) && amount > 0 ? amount : 0 };
  }).filter((item) => item.candidate && item.amount > 0.009), [draft, payload]);
  const draftTotal = draftRows.reduce((sum, item) => sum + item.amount, 0);
  const statementAmount = Math.abs(Number(selected?.amount ?? 0));
  const draftRemaining = Math.max(0, statementAmount - draftTotal);
  const hasBilling = draftRows.some((item) => item.candidate?.movementType === "billing");
  const hasPendingSettlement = (selected?.allocations ?? []).some((item) => !item.settled && item.movementType !== "billing");

  async function saveRateio(settleAfter = false) {
    if (!selected) return;
    if (draftTotal > statementAmount + 0.01) { setMessage("A soma do rateio ultrapassa o valor do lançamento bancário."); return; }
    if (settleAfter && hasBilling) { setMessage("Existe faturamento sem parcelas no rateio. Gere as parcelas antes de executar as baixas."); return; }
    if (settleAfter) {
      const confirmed = window.confirm(`Confirmar o rateio de ${money(draftTotal)} em ${draftRows.length} título(s) e executar as baixas financeiras?\n\nValor do extrato: ${money(statementAmount)}\nAinda sem rateio: ${money(draftRemaining)}\n\nCada baixa ficará registrada individualmente na auditoria.`);
      if (!confirmed) return;
    }
    setLoading(true);
    try {
      const saveResponse = await fetch("/api/treasury-reconciliation-allocations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", transactionId: selected.id, allocations: draftRows.map((item) => ({ movementType: item.candidate!.movementType, movementId: item.candidate!.movementId, amount: item.amount })) }),
      });
      const saveResult = await saveResponse.json().catch(() => ({})) as { error?: string };
      if (!saveResponse.ok) { setMessage(saveResult.error ?? "Não foi possível salvar o rateio."); return; }
      if (settleAfter && draftRows.length) {
        const settleResponse = await fetch("/api/treasury-reconciliation-allocations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settle", transactionId: selected.id }) });
        const settleResult = await settleResponse.json().catch(() => ({})) as { error?: string; count?: number; amount?: number };
        if (!settleResponse.ok) { setMessage(`Rateio salvo, mas a baixa não foi concluída: ${settleResult.error ?? "revise os títulos."}`); await refresh(accountId, true); return; }
        setMessage(`${settleResult.count ?? draftRows.length} baixa(s) realizada(s), totalizando ${money(settleResult.amount ?? draftTotal)}.`);
      } else {
        setMessage(draftRows.length ? `Rateio salvo. ${money(draftRemaining)} do extrato ainda está sem destino.` : "Rateio removido.");
      }
      await refresh(accountId, true);
    } finally { setLoading(false); }
  }

  async function settleSaved() {
    if (!selected || !hasPendingSettlement) return;
    if (selected.allocations.some((item) => !item.settled && item.movementType === "billing")) { setMessage("Gere as parcelas do faturamento antes de executar as baixas."); return; }
    const pendingAmount = selected.allocations.filter((item) => !item.settled && item.movementType !== "billing").reduce((sum, item) => sum + Number(item.allocatedAmount), 0);
    if (!window.confirm(`Executar ${selected.allocations.filter((item) => !item.settled && item.movementType !== "billing").length} baixa(s) do rateio salvo, totalizando ${money(pendingAmount)}?`)) return;
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-reconciliation-allocations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settle", transactionId: selected.id }) });
      const result = await response.json().catch(() => ({})) as { error?: string; count?: number; amount?: number };
      if (!response.ok) { setMessage(result.error ?? "Não foi possível executar as baixas do rateio."); return; }
      setMessage(`${result.count ?? 0} baixa(s) realizada(s), totalizando ${money(result.amount ?? pendingAmount)}.`);
      await refresh(accountId, true);
    } finally { setLoading(false); }
  }

  async function reverse(settlement: Settlement) {
    if (!window.confirm(`Estornar somente esta baixa de ${money(settlement.settlementAmount)} realizada em ${shortDate(settlement.paymentDate)}?\n\nOs demais rateios e baixas serão preservados.`)) return;
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-reconciliation-allocations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reverse", settlementId: settlement.id }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setMessage(result.error ?? "Não foi possível estornar esta baixa."); return; }
      setMessage("Baixa estornada. O rateio bancário foi mantido para revisão ou nova baixa.");
      await refresh(accountId, true);
    } finally { setLoading(false); }
  }

  const transactionRows = useMemo(() => (payload?.transactions ?? []).slice(0, 250), [payload]);
  if (!target || authorized !== true) return null;

  return <>
    {createPortal(<button type="button" className="split-trigger" onClick={() => setOpen(true)}><span>RATEIOS</span><strong>Parcial / agrupado</strong><small>1 extrato ↔ vários títulos</small></button>, target)}
    {open ? <div className="split-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="split-dashboard" role="dialog" aria-modal="true" aria-label="Rateios da conciliação bancária">
        <header className="split-header">
          <div><small>FINANCEIRO · TESOURARIA</small><h2>Conciliação parcial e agrupada</h2><p>Distribua um lançamento bancário entre vários títulos ou use vários lançamentos para completar o mesmo título. Rateio e baixa são etapas separadas e auditáveis.</p></div>
          <div className="split-actions"><label><span>Conta bancária</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` · ${account.bankName}` : ""}</option>)}</select></label><button type="button" onClick={() => void refresh()} disabled={!accountId || loading}>{loading ? "Atualizando…" : "Atualizar"}</button><button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button></div>
        </header>
        {message ? <div className="split-message">{message}</div> : null}
        {!accounts.length ? <div className="split-empty-main">Cadastre uma conta na Tesouraria e importe um extrato antes de usar os rateios.</div> : <div className="split-body">
          <aside className="split-transactions">
            <header><div><small>EXTRATO</small><h3>Lançamentos importados</h3></div><strong>{transactionRows.length}</strong></header>
            <div className="split-transaction-list">{transactionRows.map((transaction) => {
              const description = descriptions[transaction.id];
              const partial = transaction.allocatedAmount > 0.01 && !transaction.fullyAllocated;
              return <button type="button" key={transaction.id} className={`${selectedId === transaction.id ? "active" : ""} ${transaction.fullyAllocated ? "done" : partial ? "partial" : ""}`} onClick={() => setSelectedId(transaction.id)}>
                <div><strong>{shortDate(transaction.transactionDate)} · {money(transaction.amount)}</strong><span>{description?.description ?? description?.memo ?? `Lançamento #${transaction.id}`}</span></div>
                <div className="split-progress"><b>{money(transaction.allocatedAmount)}</b><small>{transaction.fullyAllocated ? "conciliado" : partial ? `${money(transaction.unallocatedAmount)} sem rateio` : "sem rateio"}</small>{transaction.settlements.length ? <em>{transaction.settlements.length} baixa(s)</em> : null}</div>
              </button>;
            })}</div>
          </aside>

          <main className="split-editor">
            {!selected ? <div className="split-empty">Selecione um lançamento do extrato.</div> : <>
              <section className="split-summary">
                <article><span>Valor do extrato</span><strong>{money(statementAmount)}</strong><small>{selected.amount >= 0 ? "entrada" : "saída"} · {shortDate(selected.transactionDate)}</small></article>
                <article><span>Rateado agora</span><strong>{money(draftTotal)}</strong><small>{draftRows.length} título(s)</small></article>
                <article className={draftRemaining > 0.01 ? "warning" : "good"}><span>Sem destino</span><strong>{money(draftRemaining)}</strong><small>{draftRemaining <= 0.01 ? "rateio fecha o extrato" : "pode salvar parcialmente"}</small></article>
                <article><span>Baixas ativas</span><strong>{selected.settlements.length}</strong><small>{money(selected.settlements.reduce((sum, item) => sum + Number(item.settlementAmount), 0))}</small></article>
              </section>

              {selected.allocations.some((item) => item.settled) ? <section className="split-settled-card"><header><div><small>BAIXAS JÁ REALIZADAS</small><h3>Partes protegidas do rateio</h3></div><span>Para editar o valor, estorne primeiro a baixa correspondente.</span></header><div>{selected.allocations.filter((item) => item.settled).map((allocation) => <article key={allocation.id}><div><strong>{allocation.candidate?.document ?? `#${allocation.movementId}`} · {allocation.candidate?.counterpart ?? movementLabel(allocation.movementType)}</strong><small>{allocation.candidate?.detail ?? "Título financeiro"} · {money(allocation.allocatedAmount)}</small></div>{allocation.settlement ? <button type="button" onClick={() => void reverse(allocation.settlement!)} disabled={loading}>Estornar esta baixa</button> : null}</article>)}</div></section> : null}

              <section className="split-candidates-card">
                <header><div><small>RATEIO</small><h3>Distribuir entre títulos</h3></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar documento, cliente ou fornecedor..." /></header>
                <div className="split-candidate-head"><span>Título</span><span>Financeiro</span><span>Disponível conciliação</span><span>Ratear</span></div>
                <div className="split-candidate-list">{candidates.map((candidate) => {
                  const existing = existingByKey.get(candidate.key);
                  const locked = Boolean(existing?.settled);
                  const availableForThis = candidate.availableAmount + Number(existing?.allocatedAmount ?? 0);
                  return <article key={candidate.key} className={`${locked ? "locked" : ""} ${Number(draft[candidate.key] ?? 0) > 0 ? "selected" : ""}`}>
                    <div><strong>{candidate.document} · {candidate.counterpart}</strong><small>{candidate.detail} · {movementLabel(candidate.movementType)} · {shortDate(candidate.date)}</small></div>
                    <div><b>{money(candidate.remainingAmount)}</b><small>saldo atual</small></div>
                    <div><b>{money(availableForThis)}</b><small>de {money(candidate.totalAmount)}</small></div>
                    <div><input type="number" min="0" step="0.01" max={availableForThis} value={draft[candidate.key] ?? ""} disabled={locked} placeholder="0,00" onChange={(event) => setDraft((current) => ({ ...current, [candidate.key]: event.target.value }))} />{candidate.movementType === "billing" ? <small className="billing-note">só concilia; gere parcelas para baixar</small> : locked ? <small className="locked-note">baixa ativa</small> : null}</div>
                  </article>;
                })}{!candidates.length ? <p className="split-empty">Nenhum título compatível com a busca.</p> : null}</div>
              </section>

              <footer className="split-footer"><div><strong>{money(draftTotal)} de {money(statementAmount)}</strong><span>{draftRemaining > 0.01 ? `${money(draftRemaining)} continuará sem conciliação` : "O rateio fecha o valor do extrato"}</span></div><div><button type="button" className="secondary" onClick={() => void saveRateio(false)} disabled={loading || draftTotal > statementAmount + 0.01}>{draftRows.length ? "Salvar rateio" : "Limpar rateio"}</button>{hasPendingSettlement ? <button type="button" className="settle-secondary" onClick={() => void settleSaved()} disabled={loading}>Baixar rateios salvos</button> : null}<button type="button" className="settle" onClick={() => void saveRateio(true)} disabled={loading || !draftRows.length || hasBilling || draftTotal > statementAmount + 0.01}>Salvar e dar baixa</button></div></footer>
            </>}
          </main>
        </div>}
      </section>
    </div> : null}
  </>;
}
