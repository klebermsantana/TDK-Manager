"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type BankAccount = { id: number; name: string; bankName: string | null; active: boolean };
type SuggestionItem = {
  key: string;
  movementType: "receivable" | "billing" | "payable";
  movementId: number;
  document: string;
  counterpart: string;
  detail: string;
  date: string | null;
  amount: number;
  availableAmount: number;
  historyScore: number;
  historyMatches: number;
};
type Suggestion = {
  id: string;
  type: "exact" | "near" | "partial";
  confidence: "alta" | "media" | "baixa";
  score: number;
  total: number;
  difference: number;
  reasons: string[];
  items: SuggestionItem[];
};
type SmartTransaction = {
  id: number;
  transactionDate: string;
  amount: number;
  description: string;
  memo: string | null;
  document: string | null;
  allocatedAmount: number;
  unallocatedAmount: number;
  legacyMatched: boolean;
  currentAllocations: Array<{ movementType: string; movementId: number; amount: number }>;
  suggestions: Suggestion[];
};
type Payload = {
  transactions: SmartTransaction[];
  summary: {
    transactionsWithSuggestions: number;
    highConfidence: number;
    exactMatches: number;
    partialMatches: number;
    learnedConfirmations: number;
    learnedCounterparts: number;
    settledConfirmations: number;
    historyBoosted: number;
  };
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "—";
const movementLabel = (type: string) => type === "receivable" ? "Receber" : type === "payable" ? "Pagar" : "Faturamento";
const suggestionLabel = (type: Suggestion["type"]) => type === "exact" ? "Fecha o extrato" : type === "partial" ? "Pagamento parcial" : "Combinação próxima";

export function TreasuryReconciliationSmartSuggestions() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
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
      const response = await fetch(`/api/treasury-reconciliation-smart-suggestions?bankAccountId=${encodeURIComponent(account)}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (response.status === 403) { setAuthorized(false); return; }
      if (!response.ok) { setMessage(result.error ?? "Não foi possível calcular as sugestões."); return; }
      setPayload(result);
      setMessage(result.transactions.length ? "" : "Nenhuma combinação confiável encontrada para esta conta no momento.");
    } finally { if (!silent) setLoading(false); }
  }

  useEffect(() => { if (target && authorized === null) void loadAccounts(); }, [target, authorized]);
  useEffect(() => { if (open) void loadAccounts(); }, [open]);
  useEffect(() => { if (open && accountId) void refresh(accountId); }, [open, accountId]);

  async function applySuggestion(transaction: SmartTransaction, suggestion: Suggestion) {
    const titleList = suggestion.items.map((item) => `${item.document} · ${item.counterpart}: ${money(item.amount)}`).join("\n");
    const confirmed = window.confirm(`Aplicar esta sugestão de rateio?\n\nExtrato: ${money(Math.abs(transaction.amount))}\nProposta: ${money(suggestion.total)}\nConfiança: ${suggestion.confidence.toUpperCase()} (${suggestion.score}/99)\n\n${titleList}\n\nA baixa financeira NÃO será executada agora. Você poderá revisar e baixar pela tela RATEIOS.`);
    if (!confirmed) return;

    const merged = new Map<string, { movementType: string; movementId: number; amount: number }>();
    transaction.currentAllocations.forEach((item) => merged.set(`${item.movementType}:${item.movementId}`, item));
    suggestion.items.forEach((item) => merged.set(item.key, { movementType: item.movementType, movementId: item.movementId, amount: item.amount }));

    setLoading(true);
    try {
      const response = await fetch("/api/treasury-reconciliation-allocations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", transactionId: transaction.id, allocations: [...merged.values()] }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; allocatedAmount?: number; unallocatedAmount?: number };
      if (!response.ok) { setMessage(result.error ?? "Não foi possível aplicar a sugestão."); return; }
      setMessage(`Sugestão aplicada ao rateio. ${money(result.allocatedAmount ?? suggestion.total)} conciliados; ${money(result.unallocatedAmount ?? 0)} ainda sem destino. Revise em RATEIOS antes da baixa.`);
      await refresh(accountId, true);
    } finally { setLoading(false); }
  }

  const rows = useMemo(() => (payload?.transactions ?? []).filter((transaction) => {
    if (filter === "high") return transaction.suggestions.some((item) => item.confidence === "alta");
    if (filter === "exact") return transaction.suggestions.some((item) => item.type === "exact");
    if (filter === "partial") return transaction.suggestions.some((item) => item.type === "partial");
    if (filter === "learned") return transaction.suggestions.some((item) => item.items.some((candidate) => candidate.historyMatches > 0));
    return true;
  }), [payload, filter]);

  if (!target || authorized !== true) return null;

  return <>
    {createPortal(<button type="button" className="smart-trigger" onClick={() => setOpen(true)}><span>SUGESTÕES</span><strong>Agrupamento inteligente</strong><small>{payload ? `${payload.summary.transactionsWithSuggestions} proposta(s) · ${payload.summary.learnedConfirmations} histórico(s)` : "valor + data + histórico aprendido"}</small></button>, target)}
    {open ? <div className="smart-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="smart-dashboard" role="dialog" aria-modal="true" aria-label="Sugestões inteligentes de conciliação">
        <header className="smart-header">
          <div><small>FINANCEIRO · TESOURARIA</small><h2>Sugestões inteligentes de agrupamento</h2><p>O TDK Manager compara valor, data, cliente/fornecedor e títulos em aberto e usa conciliações confirmadas como reforço de histórico. O aprendizado altera apenas a confiança da sugestão; nunca executa conciliação ou baixa sozinho.</p></div>
          <div className="smart-actions"><label><span>Conta bancária</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` · ${account.bankName}` : ""}</option>)}</select></label><button type="button" onClick={() => void refresh()} disabled={!accountId || loading}>{loading ? "Analisando…" : "Recalcular"}</button><button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button></div>
        </header>

        {message ? <div className="smart-message">{message}</div> : null}
        <div className="smart-kpis">
          <article><span>Lançamentos com sugestão</span><strong>{payload?.summary.transactionsWithSuggestions ?? 0}</strong><small>com combinação acima do limite de confiança</small></article>
          <article className="good"><span>Alta confiança</span><strong>{payload?.summary.highConfidence ?? 0}</strong><small>forte aderência de valor, data e histórico</small></article>
          <article><span>Fechamento exato</span><strong>{payload?.summary.exactMatches ?? 0}</strong><small>combinação fecha o valor do extrato</small></article>
          <article><span>Possível parcial</span><strong>{payload?.summary.partialMatches ?? 0}</strong><small>extrato menor que um título compatível</small></article>
          <article className="learned"><span>Aprendizado ativo</span><strong>{payload?.summary.learnedConfirmations ?? 0}</strong><small>{payload?.summary.learnedCounterparts ?? 0} cliente(s)/fornecedor(es) · {payload?.summary.historyBoosted ?? 0} sugestão(ões) reforçadas</small></article>
        </div>

        <div className="smart-toolbar"><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Todas as sugestões</option><option value="high">Alta confiança</option><option value="exact">Fechamento exato</option><option value="partial">Pagamento parcial</option><option value="learned">Reforçadas pelo histórico</option></select><span>{rows.length} lançamento(s) exibido(s) · {payload?.summary.settledConfirmations ?? 0} baixa(s) confirmada(s) na base de aprendizado</span></div>

        <div className="smart-content">{rows.length ? rows.map((transaction) => <article className="smart-transaction" key={transaction.id}>
          <header><div><small>{shortDate(transaction.transactionDate)} · {transaction.amount >= 0 ? "ENTRADA" : "SAÍDA"}</small><h3>{transaction.description}</h3><p>{transaction.memo || transaction.document || "Sem histórico complementar"}</p></div><div><strong>{money(transaction.amount)}</strong><span>{transaction.allocatedAmount > 0.01 ? `${money(transaction.allocatedAmount)} já rateados` : "sem rateio atual"}</span><em>{money(transaction.unallocatedAmount)} para analisar</em></div></header>
          <div className="smart-suggestions">{transaction.suggestions.map((suggestion, index) => <section key={suggestion.id} className={`smart-suggestion confidence-${suggestion.confidence}`}>
            <div className="smart-suggestion-head"><div><span className={`smart-confidence ${suggestion.confidence}`}>{suggestion.confidence === "alta" ? "Alta confiança" : suggestion.confidence === "media" ? "Confiança média" : "Revisar com atenção"}</span><strong>Opção {index + 1} · {suggestionLabel(suggestion.type)}</strong></div><div><b>{money(suggestion.total)}</b><small>score {suggestion.score}/99{suggestion.difference > 0.01 ? ` · diferença ${money(suggestion.difference)}` : " · valor fechado"}</small></div></div>
            <div className="smart-items">{suggestion.items.map((item) => <div key={item.key}><span>{movementLabel(item.movementType)}</span><div><strong>{item.document} · {item.counterpart}</strong><small>{item.detail} · {shortDate(item.date)}{item.historyMatches > 0 ? ` · histórico: ${item.historyMatches} confirmação(ões)` : ""}</small></div><b>{money(item.amount)}</b></div>)}</div>
            <div className="smart-reasons"><span>Por que foi sugerido:</span>{suggestion.reasons.map((reason) => <small key={reason}>{reason}</small>)}</div>
            {suggestion.items.some((item) => item.movementType === "billing") ? <p className="smart-warning">Há faturamento sem parcelas nesta proposta. O rateio pode ser salvo, mas a baixa exigirá a geração das parcelas.</p> : null}
            <button type="button" onClick={() => void applySuggestion(transaction, suggestion)} disabled={loading}>Aplicar rateio</button>
          </section>)}</div>
        </article>) : <div className="smart-empty">Nenhuma sugestão para o filtro selecionado.</div>}</div>
      </section>
    </div> : null}
  </>;
}
