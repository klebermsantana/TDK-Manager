"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type BankAccount = { id: number; name: string; bankName: string | null; active: boolean };
type Candidate = {
  key: string;
  movementType: "receivable" | "billing" | "payable";
  movementId: number;
  document: string;
  counterpart: string;
  detail: string;
  amount: number;
  remainingAmount: number;
  recordedAmount: number;
  date: string | null;
  amountDiff: number;
  dateDiff: number;
  score: number;
};
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
type BankTransaction = {
  id: number;
  transactionDate: string;
  amount: number;
  description: string;
  memo: string | null;
  document: string | null;
  status: "reconciled" | "divergent" | "suggested" | "unmatched";
  matched: Candidate | null;
  suggestion: Candidate | null;
  alternatives: Candidate[];
  amountDiff: number | null;
  dateDiff: number | null;
  settlement: Settlement | null;
};
type ImportRow = { id: number; fileName: string; fileType: string; periodStart: string | null; periodEnd: string | null; transactionCount: number; createdAt: string };
type AuditRow = {
  id: number;
  statementTransactionId: number;
  bankAccountId: number;
  movementType: string;
  movementId: number;
  action: string;
  amount: number;
  previousAmount: number;
  resultingAmount: number;
  previousStatus: string;
  resultingStatus: string;
  paymentDate: string;
  performedBy: string;
  createdAt: string;
};
type Payload = {
  imports: ImportRow[];
  transactions: BankTransaction[];
  summary: { total: number; reconciled: number; divergent: number; suggested: number; unmatched: number; settled: number; credits: number; debits: number };
  audit: AuditRow[];
};
type ParsedTransaction = { externalId: string | null; transactionDate: string; amount: number; description: string; memo: string | null; document: string | null; balance: number | null };
type ParsedFile = { fileName: string; fileType: "ofx" | "csv"; transactions: ParsedTransaction[] };

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "—";
const statusLabel = { reconciled: "Conciliado", divergent: "Divergente", suggested: "Sugestão", unmatched: "Não identificado" } as const;
const movementLabel = (type: string) => type === "receivable" ? "Recebimento" : type === "payable" ? "Pagamento" : "Faturamento";
const centsEqual = (a: number, b: number) => Math.abs(a - b) <= 0.01;

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseDate(value: string) {
  const clean = value.trim().replace(/[T ].*$/, "");
  let match = clean.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = clean.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return null;
}

function parseMoney(value: string) {
  let clean = value.trim().replace(/R\$/gi, "").replace(/\s/g, "");
  const negative = /^\(.*\)$/.test(clean);
  clean = clean.replace(/[()]/g, "");
  if (clean.includes(",") && clean.includes(".")) {
    clean = clean.lastIndexOf(",") > clean.lastIndexOf(".") ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/,/g, "");
  } else if (clean.includes(",")) clean = clean.replace(/\./g, "").replace(",", ".");
  clean = clean.replace(/[^0-9+\-.]/g, "");
  const number = Number(clean);
  return Number.isFinite(number) ? (negative ? -Math.abs(number) : number) : NaN;
}

function splitCsvLine(line: string, delimiter: string) {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { result.push(current); current = ""; }
    else current += char;
  }
  result.push(current);
  return result.map((item) => item.trim());
}

function parseCsv(text: string): ParsedTransaction[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("O CSV não possui linhas suficientes.");
  const first = lines[0];
  const delimiter = [";", ",", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const headers = splitCsvLine(first, delimiter).map(normalizeHeader);
  const find = (...names: string[]) => headers.findIndex((header) => names.some((name) => header === name || header.includes(name)));
  const dateIndex = find("data", "date", "dtposted", "transaction date");
  const descriptionIndex = find("descricao", "historico", "description", "memo", "nome", "name");
  const amountIndex = find("valor", "amount", "transaction amount");
  const debitIndex = find("debito", "debit");
  const creditIndex = find("credito", "credit");
  const documentIndex = find("documento", "document", "fitid", "id", "referencia");
  const balanceIndex = find("saldo", "balance");
  if (dateIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) throw new Error("Não encontrei as colunas de Data e Valor no CSV.");

  return lines.slice(1).map((line, rowIndex) => {
    const cells = splitCsvLine(line, delimiter);
    const transactionDate = parseDate(cells[dateIndex] ?? "");
    let amount = amountIndex >= 0 ? parseMoney(cells[amountIndex] ?? "") : NaN;
    if (!Number.isFinite(amount)) {
      const debit = debitIndex >= 0 ? parseMoney(cells[debitIndex] ?? "") : 0;
      const credit = creditIndex >= 0 ? parseMoney(cells[creditIndex] ?? "") : 0;
      amount = (Number.isFinite(credit) ? Math.abs(credit) : 0) - (Number.isFinite(debit) ? Math.abs(debit) : 0);
    }
    if (!transactionDate || !Number.isFinite(amount) || amount === 0) throw new Error(`Linha ${rowIndex + 2}: data ou valor inválido.`);
    const description = (descriptionIndex >= 0 ? cells[descriptionIndex] : "")?.trim() || `Lançamento ${rowIndex + 1}`;
    const balance = balanceIndex >= 0 ? parseMoney(cells[balanceIndex] ?? "") : NaN;
    return {
      externalId: documentIndex >= 0 ? cells[documentIndex]?.trim() || null : null,
      transactionDate,
      amount,
      description,
      memo: null,
      document: documentIndex >= 0 ? cells[documentIndex]?.trim() || null : null,
      balance: Number.isFinite(balance) ? balance : null,
    };
  });
}

function ofxField(block: string, tag: string) {
  return block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"))?.[1]?.trim() ?? "";
}

function parseOfx(text: string): ParsedTransaction[] {
  const blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi)].map((match) => match[1]);
  if (!blocks.length) throw new Error("Não encontrei lançamentos STMTTRN no arquivo OFX.");
  return blocks.map((block, index) => {
    const rawDate = ofxField(block, "DTPOSTED");
    const transactionDate = parseDate(rawDate.slice(0, 8));
    const amount = Number(ofxField(block, "TRNAMT").replace(",", "."));
    if (!transactionDate || !Number.isFinite(amount) || amount === 0) throw new Error(`Lançamento OFX ${index + 1}: data ou valor inválido.`);
    const name = ofxField(block, "NAME");
    const memo = ofxField(block, "MEMO");
    const document = ofxField(block, "CHECKNUM") || ofxField(block, "REFNUM") || null;
    return { externalId: ofxField(block, "FITID") || null, transactionDate, amount, description: name || memo || `Lançamento ${index + 1}`, memo: memo || null, document, balance: null };
  });
}

function canSettle(transaction: BankTransaction, candidate: Candidate | null) {
  return Boolean(candidate && candidate.movementType !== "billing" && candidate.remainingAmount > 0.01 && centsEqual(Math.abs(transaction.amount), candidate.remainingAmount));
}

export function TreasuryReconciliationDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Record<number, string>>({});
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
      const response = await fetch(`/api/treasury-reconciliation?bankAccountId=${encodeURIComponent(account)}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) { setMessage(result.error ?? "Não foi possível carregar a conciliação."); return; }
      setPayload(result);
      const next: Record<number, string> = {};
      result.transactions.forEach((item) => { if (item.suggestion) next[item.id] = item.suggestion.key; });
      setSelection(next);
      setMessage("");
    } finally { if (!silent) setLoading(false); }
  }

  useEffect(() => { if (target && authorized === null) void loadAccounts(); }, [target, authorized]);
  useEffect(() => { if (open) void loadAccounts(); }, [open]);
  useEffect(() => { if (open && accountId) void refresh(accountId); }, [open, accountId]);

  async function chooseFile(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      const extension = file.name.split(".").pop()?.toLowerCase();
      const fileType: "ofx" | "csv" = extension === "ofx" || extension === "qfx" ? "ofx" : "csv";
      const transactions = fileType === "ofx" ? parseOfx(text) : parseCsv(text);
      setParsed({ fileName: file.name, fileType, transactions });
      setMessage(`${transactions.length} lançamento(s) lido(s) do arquivo.`);
    } catch (error) {
      setParsed(null);
      setMessage(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    }
  }

  async function importFile() {
    if (!parsed || !accountId) return;
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-reconciliation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bankAccountId: Number(accountId), ...parsed }) });
      const result = await response.json().catch(() => ({})) as { error?: string; transactionCount?: number };
      if (!response.ok) { setMessage(result.error ?? "Não foi possível importar o extrato."); return; }
      setMessage(`${result.transactionCount ?? parsed.transactions.length} lançamento(s) importado(s). Revise as sugestões antes de conciliar.`);
      setParsed(null);
      await refresh(accountId, true);
    } finally { setLoading(false); }
  }

  function selectedCandidate(transaction: BankTransaction) {
    if (transaction.matched) return transaction.matched;
    const key = selection[transaction.id] || transaction.suggestion?.key || "";
    return transaction.alternatives.find((item) => item.key === key) ?? null;
  }

  async function reconcile(transaction: BankTransaction) {
    const candidate = selectedCandidate(transaction);
    if (!candidate) { setMessage("Selecione um lançamento do TDK Manager."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-reconciliation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "match", transactionId: transaction.id, movementType: candidate.movementType, movementId: candidate.movementId }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setMessage(result.error ?? "Não foi possível conciliar."); return; }
      setMessage("Lançamento conciliado. A conta bancária também foi vinculada ao movimento do sistema.");
      await refresh(accountId, true);
    } finally { setLoading(false); }
  }

  async function settle(transaction: BankTransaction) {
    const candidate = selectedCandidate(transaction);
    if (!candidate) { setMessage("Selecione um lançamento do TDK Manager."); return; }
    if (candidate.movementType === "billing") { setMessage("Gere as parcelas do faturamento antes de usar a baixa assistida."); return; }
    if (!canSettle(transaction, candidate)) {
      setMessage(candidate.remainingAmount <= 0.01
        ? "Este título já está baixado no financeiro. Você pode apenas conciliá-lo com o extrato."
        : `A baixa assistida exige o saldo integral restante (${money(candidate.remainingAmount)}). Para parcial, use a baixa manual.`);
      return;
    }
    const actionText = transaction.amount >= 0 ? "recebimento" : "pagamento";
    const confirmed = window.confirm(`Confirmar ${actionText} de ${money(Math.abs(transaction.amount))} em ${shortDate(transaction.transactionDate)} para ${candidate.document} · ${candidate.counterpart}?\n\nEsta ação atualizará o financeiro e ficará registrada na auditoria.`);
    if (!confirmed) return;
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-reconciliation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settle", transactionId: transaction.id, movementType: candidate.movementType, movementId: candidate.movementId }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setMessage(result.error ?? "Não foi possível realizar a baixa assistida."); return; }
      setMessage(`${transaction.amount >= 0 ? "Recebimento" : "Pagamento"} baixado com sucesso pela conciliação. Data, valor, conta e usuário foram registrados.`);
      await refresh(accountId, true);
    } finally { setLoading(false); }
  }

  async function reverseSettlement(transaction: BankTransaction) {
    if (!transaction.settlement) return;
    const confirmed = window.confirm(`Estornar a baixa de ${money(transaction.settlement.settlementAmount)} realizada em ${shortDate(transaction.settlement.paymentDate)}?\n\nO título voltará ao valor/status anterior à baixa assistida. A conciliação bancária será mantida e o estorno ficará registrado na auditoria.`);
    if (!confirmed) return;
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-reconciliation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reverse-settlement", transactionId: transaction.id }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setMessage(result.error ?? "Não foi possível estornar a baixa."); return; }
      setMessage("Baixa assistida estornada. O título voltou à situação anterior e a auditoria foi preservada.");
      await refresh(accountId, true);
    } finally { setLoading(false); }
  }

  async function undo(transaction: BankTransaction) {
    if (transaction.settlement) { setMessage("Estorne a baixa financeira antes de desfazer a conciliação."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-reconciliation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unmatch", transactionId: transaction.id }) });
      if (!response.ok) { const result = await response.json().catch(() => ({})) as { error?: string }; setMessage(result.error ?? "Não foi possível desfazer."); return; }
      setMessage("Conciliação desfeita. A classificação bancária do movimento foi preservada.");
      await refresh(accountId, true);
    } finally { setLoading(false); }
  }

  const rows = useMemo(() => (payload?.transactions ?? []).filter((item) => {
    if (status === "settled" && !item.settlement) return false;
    if (status !== "all" && status !== "settled" && item.status !== status) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return `${item.description} ${item.memo ?? ""} ${item.document ?? ""} ${item.matched?.counterpart ?? ""}`.toLowerCase().includes(term);
  }), [payload, status, search]);

  const preview = useMemo(() => parsed ? {
    credits: parsed.transactions.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0),
    debits: parsed.transactions.filter((item) => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0),
    start: [...parsed.transactions].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate))[0]?.transactionDate,
    end: [...parsed.transactions].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))[0]?.transactionDate,
  } : null, [parsed]);

  if (!target || authorized !== true) return null;

  return <>
    {createPortal(<button type="button" className="recon-trigger" onClick={() => setOpen(true)}><span>CONCILIAÇÃO</span><strong>Extrato x sistema</strong><small>{payload ? `${payload.summary.reconciled}/${payload.summary.total} conciliados · ${payload.summary.settled} baixas` : "OFX / CSV"}</small></button>, target)}
    {open ? <div className="recon-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="recon-dashboard" role="dialog" aria-modal="true" aria-label="Conciliação bancária">
        <header className="recon-header">
          <div><small>FINANCEIRO · TESOURARIA</small><h2>Conciliação bancária</h2><p>Importe OFX ou CSV, revise os vínculos e, quando o valor corresponder ao saldo integral do título, confirme também a baixa financeira. Nada é baixado sem sua confirmação.</p></div>
          <div className="recon-actions"><label><span>Conta bancária</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` · ${account.bankName}` : ""}</option>)}</select></label><button type="button" onClick={() => void refresh()} disabled={!accountId || loading}>Atualizar</button><button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button></div>
        </header>

        {message ? <div className="recon-message">{message}</div> : null}
        {!accounts.length ? <div className="recon-empty-main">Cadastre pelo menos uma conta na Tesouraria antes de importar o extrato.</div> : <>
          <div className="recon-kpis">
            <article className="good"><span>Conciliados</span><strong>{payload?.summary.reconciled ?? 0}</strong><small>confirmados e sem divergência relevante</small></article>
            <article className="settled"><span>Baixas assistidas</span><strong>{payload?.summary.settled ?? 0}</strong><small>recebimentos/pagamentos ativos via extrato</small></article>
            <article className="suggestion"><span>Sugestões</span><strong>{payload?.summary.suggested ?? 0}</strong><small>valor/data compatíveis aguardando revisão</small></article>
            <article className="danger"><span>Divergentes</span><strong>{payload?.summary.divergent ?? 0}</strong><small>vínculo confirmado com diferença</small></article>
            <article><span>Não identificados</span><strong>{payload?.summary.unmatched ?? 0}</strong><small>sem candidato confiável</small></article>
            <article><span>Créditos importados</span><strong>{money(payload?.summary.credits ?? 0)}</strong><small>entradas do extrato</small></article>
            <article><span>Débitos importados</span><strong>{money(payload?.summary.debits ?? 0)}</strong><small>saídas do extrato</small></article>
          </div>

          <div className="recon-grid">
            <section className="recon-card import-card">
              <header><div><small>IMPORTAR EXTRATO</small><h3>OFX ou CSV</h3></div><strong>{parsed ? parsed.fileName : "Novo arquivo"}</strong></header>
              <div className="recon-upload"><input type="file" accept=".ofx,.qfx,.csv,text/csv,application/x-ofx" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} /><p>CSV: o sistema reconhece colunas comuns como Data, Valor, Débito, Crédito, Descrição/Histórico e Documento.</p></div>
              {parsed && preview ? <div className="recon-preview"><span><b>{parsed.transactions.length}</b> lançamentos</span><span><b>{shortDate(preview.start ?? null)} – {shortDate(preview.end ?? null)}</b> período</span><span><b>{money(preview.credits)}</b> créditos</span><span><b>{money(preview.debits)}</b> débitos</span><button type="button" onClick={() => void importFile()} disabled={loading || !accountId}>{loading ? "Importando…" : "Importar para esta conta"}</button></div> : null}
            </section>

            <section className="recon-card history-card">
              <header><div><small>HISTÓRICO</small><h3>Últimas importações</h3></div><strong>{payload?.imports.length ?? 0}</strong></header>
              {payload?.imports.length ? <div className="recon-history">{payload.imports.slice(0, 6).map((item) => <article key={item.id}><div><strong>{item.fileName}</strong><small>{item.fileType.toUpperCase()} · {item.transactionCount} lançamento(s)</small></div><span>{shortDate(item.periodStart)} – {shortDate(item.periodEnd)}</span></article>)}</div> : <p className="recon-empty">Nenhum extrato importado para esta conta.</p>}
            </section>

            {payload?.audit?.length ? <section className="recon-card wide audit-card">
              <header><div><small>AUDITORIA FINANCEIRA</small><h3>Baixas e estornos realizados pela conciliação</h3></div><strong>{payload.audit.length} evento(s) recentes</strong></header>
              <div className="recon-audit">{payload.audit.slice(0, 12).map((event) => {
                const tx = payload.transactions.find((item) => item.id === event.statementTransactionId);
                const document = tx?.matched?.document ?? `#${event.movementId}`;
                return <article key={event.id} className={event.action === "reverse" ? "reverse" : "settle"}><div><strong>{event.action === "reverse" ? "Estorno" : "Baixa"} · {movementLabel(event.movementType)} {document}</strong><small>{event.performedBy} · data financeira {shortDate(event.paymentDate)}</small></div><div><b>{money(event.amount)}</b><span>{event.previousStatus} → {event.resultingStatus}</span></div></article>;
              })}</div>
            </section> : null}

            <section className="recon-card wide">
              <header className="recon-table-header"><div><small>CONFERÊNCIA</small><h3>Extrato x TDK Manager</h3></div><div className="recon-filters"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="settled">Baixas assistidas</option><option value="suggested">Sugestões</option><option value="unmatched">Não identificados</option><option value="divergent">Divergentes</option><option value="reconciled">Conciliados</option></select><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar descrição..." /></div></header>
              {rows.length ? <div className="recon-table-wrap"><table><thead><tr><th>Data</th><th>Extrato</th><th>Valor</th><th>Status</th><th>TDK Manager</th><th>Diferença</th><th>Ação</th></tr></thead><tbody>{rows.slice(0, 250).map((item) => {
                const candidates = item.alternatives ?? [];
                const selectedKey = selection[item.id] || item.suggestion?.key || "";
                const candidate = selectedCandidate(item);
                const eligible = canSettle(item, candidate);
                return <tr key={item.id} className={`status-${item.status}${item.settlement ? " has-settlement" : ""}`}><td>{shortDate(item.transactionDate)}</td><td><strong>{item.description}</strong><small>{item.memo || item.document || ""}</small></td><td className={item.amount >= 0 ? "credit" : "debit"}>{money(item.amount)}</td><td><span className={`recon-status ${item.status}`}>{statusLabel[item.status]}</span>{item.settlement ? <span className="recon-settled-badge">Baixa realizada</span> : null}</td><td>{item.matched ? <div className="recon-match"><strong>{item.matched.document} · {item.matched.counterpart}</strong><small>{item.matched.detail} · {money(item.matched.amount)} · {shortDate(item.matched.date)}</small>{item.matched.remainingAmount > 0.01 ? <small>Saldo restante: {money(item.matched.remainingAmount)}</small> : <small>Título já baixado no financeiro</small>}</div> : candidates.length ? <><select value={selectedKey} onChange={(event) => setSelection((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Selecione...</option>{candidates.map((option) => <option key={option.key} value={option.key}>{option.document} · {option.counterpart} · {money(option.amount)} · {shortDate(option.date)}</option>)}</select>{candidate ? <small className="candidate-note">Saldo: {money(candidate.remainingAmount)}{candidate.movementType === "billing" ? " · gere parcelas para baixar" : ""}</small> : null}</> : <span className="muted">Sem candidato</span>}</td><td>{item.matched ? <><strong>{item.amountDiff !== null ? money(item.amountDiff) : "—"}</strong><small>{item.dateDiff !== null ? `${item.dateDiff} dia(s)` : ""}</small></> : item.suggestion ? <><strong>{money(item.suggestion.amountDiff)}</strong><small>{item.suggestion.dateDiff} dia(s)</small></> : "—"}</td><td><div className="recon-row-actions">{item.settlement ? <button type="button" className="danger-action" onClick={() => void reverseSettlement(item)} disabled={loading}>Estornar baixa</button> : item.matched ? <><button type="button" className="settle-action" onClick={() => void settle(item)} disabled={loading || !eligible} title={!eligible ? "A baixa assistida exige que o extrato corresponda ao saldo integral restante do título." : ""}>Dar baixa</button><button type="button" className="secondary" onClick={() => void undo(item)} disabled={loading}>Desfazer</button></> : candidates.length ? <><button type="button" onClick={() => void reconcile(item)} disabled={loading || !selectedKey}>Conciliar</button><button type="button" className="settle-action" onClick={() => void settle(item)} disabled={loading || !selectedKey || !eligible} title={!eligible ? "Disponível quando o valor do extrato corresponde ao saldo integral do título." : ""}>Conciliar e dar baixa</button></> : null}</div></td></tr>;
              })}</tbody></table>{rows.length > 250 ? <p className="recon-limit">Exibindo os primeiros 250 lançamentos do filtro atual.</p> : null}</div> : <p className="recon-empty">Nenhum lançamento para o filtro selecionado.</p>}
            </section>
          </div>
        </>}
      </section>
    </div> : null}
  </>;
}
