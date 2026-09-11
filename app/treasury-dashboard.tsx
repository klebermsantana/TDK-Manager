"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type BankAccount = {
  id: number;
  name: string;
  bankName: string | null;
  accountType: string;
  agency: string | null;
  accountNumber: string | null;
  openingBalance: number;
  openingDate: string;
  currentBalance: number;
  balanceDate: string;
  active: boolean;
  notes: string | null;
};

type Movement = {
  id: string;
  movementId: number;
  type: "inflow" | "outflow";
  source: "receivable" | "billing" | "payable";
  document: string;
  counterpart: string;
  detail: string;
  dueDate: string | null;
  scheduledAmount: number;
  realizedAmount: number;
  paymentDate: string | null;
  bankAccountId: number | null;
  allocationSource: "direct" | "billing" | null;
};

type Horizon = "30" | "60" | "90";
type AccountForm = {
  name: string;
  bankName: string;
  accountType: string;
  agency: string;
  accountNumber: string;
  openingBalance: string;
  openingDate: string;
  currentBalance: string;
  balanceDate: string;
  notes: string;
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDaysKey = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "Sem data";
const accountTypeLabel: Record<string, string> = { checking: "Conta corrente", savings: "Poupança", cash: "Caixa", investment: "Investimento", other: "Outra" };
const emptyForm = (): AccountForm => ({ name: "", bankName: "", accountType: "checking", agency: "", accountNumber: "", openingBalance: "0", openingDate: localDateKey(), currentBalance: "0", balanceDate: localDateKey(), notes: "" });

function projectedFor(account: BankAccount, movements: Movement[], days: number) {
  const today = localDateKey();
  const limit = addDaysKey(days);
  const assigned = movements.filter((item) => item.bankAccountId === account.id && item.scheduledAmount > 0);
  const inflow = assigned.filter((item) => item.type === "inflow" && item.dueDate && item.dueDate >= today && item.dueDate <= limit).reduce((sum, item) => sum + item.scheduledAmount, 0);
  const outflow = assigned.filter((item) => item.type === "outflow" && item.dueDate && item.dueDate <= limit).reduce((sum, item) => sum + item.scheduledAmount, 0);
  return { inflow, outflow, projected: account.currentBalance + inflow - outflow };
}

export function TreasuryDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [horizon, setHorizon] = useState<Horizon>("30");
  const [accountId, setAccountId] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm());
  const [showAllMovements, setShowAllMovements] = useState(false);
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
      const [accountsResponse, flowResponse] = await Promise.all([
        fetch("/api/treasury-accounts", { cache: "no-store" }),
        fetch("/api/net-cash-flow", { cache: "no-store" }),
      ]);
      if (accountsResponse.status === 403 || flowResponse.status === 403) {
        setAuthorized(false);
        return;
      }
      if (!accountsResponse.ok || !flowResponse.ok) {
        setMessage("Não foi possível carregar a tesouraria.");
        return;
      }
      const accountsPayload = await accountsResponse.json() as { accounts?: BankAccount[] };
      const flowPayload = await flowResponse.json() as { movements?: Movement[] };
      setAccounts(accountsPayload.accounts ?? []);
      setMovements(flowPayload.movements ?? []);
      setAuthorized(true);
      setMessage("");
    } catch {
      setMessage("Não foi possível carregar a tesouraria.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { if (target && authorized === null) void refresh(true); }, [target, authorized]);
  useEffect(() => { if (open) void refresh(); }, [open]);

  const activeAccounts = useMemo(() => accounts.filter((item) => item.active), [accounts]);
  const selectedAccount = accountId ? accounts.find((item) => item.id === Number(accountId)) ?? null : null;

  const summary = useMemo(() => {
    const today = localDateKey();
    const limit = addDaysKey(Number(horizon));
    const scoped = selectedAccount ? movements.filter((item) => item.bankAccountId === selectedAccount.id) : movements;
    const currentBalance = selectedAccount ? selectedAccount.currentBalance : activeAccounts.reduce((sum, item) => sum + item.currentBalance, 0);
    const inflow = scoped.filter((item) => item.type === "inflow" && item.scheduledAmount > 0 && item.dueDate && item.dueDate >= today && item.dueDate <= limit).reduce((sum, item) => sum + item.scheduledAmount, 0);
    const outflow = scoped.filter((item) => item.type === "outflow" && item.scheduledAmount > 0 && item.dueDate && item.dueDate <= limit).reduce((sum, item) => sum + item.scheduledAmount, 0);
    const overdueReceivables = scoped.filter((item) => item.type === "inflow" && item.scheduledAmount > 0 && item.dueDate && item.dueDate < today).reduce((sum, item) => sum + item.scheduledAmount, 0);
    const openMovements = movements.filter((item) => item.scheduledAmount > 0);
    const allocated = openMovements.filter((item) => item.bankAccountId !== null).length;
    const unassigned = openMovements.filter((item) => !item.bankAccountId);
    return {
      currentBalance,
      inflow,
      outflow,
      projected: currentBalance + inflow - outflow,
      overdueReceivables,
      unassignedCount: unassigned.length,
      unassignedAmount: unassigned.reduce((sum, item) => sum + item.scheduledAmount, 0),
      coverage: openMovements.length ? allocated / openMovements.length * 100 : 100,
    };
  }, [movements, activeAccounts, selectedAccount, horizon]);

  const allocationRows = useMemo(() => movements
    .filter((item) => item.scheduledAmount > 0)
    .filter((item) => showAllMovements || !item.bankAccountId)
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return b.scheduledAmount - a.scheduledAmount;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }).slice(0, 30), [movements, showAllMovements]);

  async function saveAccount() {
    const body = { ...(editingId ? { id: editingId } : {}), ...form, openingBalance: Number(form.openingBalance), currentBalance: Number(form.currentBalance) };
    if (!form.name.trim() || !Number.isFinite(body.openingBalance) || !Number.isFinite(body.currentBalance)) {
      setMessage("Informe nome e saldos válidos para a conta.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-accounts", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível salvar a conta.");
        return;
      }
      const wasEditing = editingId !== null;
      setEditingId(null);
      setForm(emptyForm());
      setMessage(wasEditing ? "Conta atualizada." : "Conta cadastrada.");
      await refresh(true);
    } finally {
      setLoading(false);
    }
  }

  function editAccount(account: BankAccount) {
    setEditingId(account.id);
    setForm({ name: account.name, bankName: account.bankName ?? "", accountType: account.accountType, agency: account.agency ?? "", accountNumber: account.accountNumber ?? "", openingBalance: String(account.openingBalance), openingDate: account.openingDate, currentBalance: String(account.currentBalance), balanceDate: account.balanceDate, notes: account.notes ?? "" });
  }

  async function toggleAccount(account: BankAccount) {
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id, active: !account.active }) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        setMessage(result.error ?? "Não foi possível alterar a conta.");
        return;
      }
      if (accountId === String(account.id) && account.active) setAccountId("");
      await refresh(true);
    } finally {
      setLoading(false);
    }
  }

  async function allocate(movement: Movement, nextAccountId: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/treasury-allocations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ movementType: movement.source, movementId: movement.movementId, bankAccountId: nextAccountId || null }) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        setMessage(result.error ?? "Não foi possível classificar o movimento.");
        return;
      }
      await refresh(true);
    } finally {
      setLoading(false);
    }
  }

  if (!target || authorized !== true) return null;

  return <>
    {createPortal(<button type="button" className="treasury-trigger" onClick={() => setOpen(true)}><span>TESOURARIA</span><strong>{money(summary.projected)}</strong><small>saldo projetado · {horizon} dias</small></button>, target)}
    {open ? <div className="treasury-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-dashboard" role="dialog" aria-modal="true" aria-label="Tesouraria e contas bancárias">
        <header className="treasury-header">
          <div><small>FINANCEIRO · TESOURARIA</small><h2>Contas e saldo bancário projetado</h2><p>Parte do saldo real informado e acrescenta entradas previstas e saídas programadas. Recebíveis já vencidos ficam fora das entradas projetadas.</p></div>
          <div className="treasury-actions">
            <label><span>Horizonte</span><select value={horizon} onChange={(event) => setHorizon(event.target.value as Horizon)}><option value="30">30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option></select></label>
            <label><span>Visão</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Consolidado</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button><button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="treasury-message">{message}</div> : null}
        <div className="treasury-kpis">
          <article><span>Saldo atual informado</span><strong>{money(summary.currentBalance)}</strong><small>{selectedAccount ? `posição de ${shortDate(selectedAccount.balanceDate)}` : `${activeAccounts.length} conta(s) ativa(s)`}</small></article>
          <article><span>Entradas projetadas</span><strong>{money(summary.inflow)}</strong><small>a vencer nos próximos {horizon} dias</small></article>
          <article><span>Saídas projetadas</span><strong>{money(summary.outflow)}</strong><small>inclui obrigações vencidas</small></article>
          <article className={summary.projected < 0 ? "danger" : "good"}><span>Saldo bancário projetado</span><strong>{money(summary.projected)}</strong><small>saldo informado + fluxo previsto</small></article>
          <article className={summary.overdueReceivables > 0 ? "warning" : "good"}><span>Recebíveis vencidos</span><strong>{money(summary.overdueReceivables)}</strong><small>fora da entrada projetada</small></article>
          <article className={summary.unassignedCount ? "warning" : "good"}><span>Alocação bancária</span><strong>{summary.coverage.toFixed(0)}%</strong><small>{summary.unassignedCount} movimento(s) sem conta · {money(summary.unassignedAmount)}</small></article>
        </div>

        <div className="treasury-grid">
          <section className="treasury-card wide">
            <header><div><small>CONTAS BANCÁRIAS</small><h3>Posição e projeção por conta</h3></div><strong>{activeAccounts.length} ativa(s)</strong></header>
            {accounts.length ? <div className="treasury-account-list">{accounts.map((account) => {
              const projection = projectedFor(account, movements, Number(horizon));
              return <article key={account.id} className={!account.active ? "inactive" : projection.projected < 0 ? "danger" : ""}>
                <div className="treasury-account-title"><strong>{account.name}</strong><span>{account.bankName ?? accountTypeLabel[account.accountType] ?? "Conta"}{account.agency ? ` · Ag. ${account.agency}` : ""}{account.accountNumber ? ` · Cc. ${account.accountNumber}` : ""}</span></div>
                <div><small>Saldo informado</small><b>{money(account.currentBalance)}</b><span>{shortDate(account.balanceDate)}</span></div>
                <div><small>Entradas</small><b>{money(projection.inflow)}</b><span>{horizon} dias</span></div>
                <div><small>Saídas</small><b>{money(projection.outflow)}</b><span>{horizon} dias</span></div>
                <div><small>Projetado</small><b>{money(projection.projected)}</b><span>{account.active ? "conta ativa" : "conta inativa"}</span></div>
                <div className="treasury-account-buttons"><button type="button" onClick={() => editAccount(account)}>Editar</button><button type="button" onClick={() => void toggleAccount(account)} disabled={loading}>{account.active ? "Desativar" : "Ativar"}</button></div>
              </article>;
            })}</div> : <p className="treasury-empty">Cadastre a primeira conta bancária para transformar o fluxo líquido em saldo bancário projetado.</p>}
          </section>

          <section className="treasury-card">
            <header><div><small>CADASTRO</small><h3>{editingId ? "Editar conta" : "Nova conta"}</h3></div>{editingId ? <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>Cancelar edição</button> : null}</header>
            <div className="treasury-form">
              <label><span>Nome da conta</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Itaú Operacional" /></label>
              <label><span>Banco</span><input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Ex.: Itaú" /></label>
              <label><span>Tipo</span><select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="cash">Caixa</option><option value="investment">Investimento</option><option value="other">Outra</option></select></label>
              <label><span>Agência</span><input value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} /></label>
              <label><span>Conta</span><input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /></label>
              <label><span>Saldo inicial</span><input type="number" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></label>
              <label><span>Data inicial</span><input type="date" value={form.openingDate} onChange={(e) => setForm({ ...form, openingDate: e.target.value })} /></label>
              <label><span>Saldo atual informado</span><input type="number" step="0.01" value={form.currentBalance} onChange={(e) => setForm({ ...form, currentBalance: e.target.value })} /></label>
              <label><span>Data do saldo</span><input type="date" value={form.balanceDate} onChange={(e) => setForm({ ...form, balanceDate: e.target.value })} /></label>
              <label className="wide"><span>Observação</span><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
              <button type="button" className="primary" onClick={() => void saveAccount()} disabled={loading}>{editingId ? "Salvar conta" : "Cadastrar conta"}</button>
            </div>
          </section>

          <section className="treasury-card wide">
            <header><div><small>CLASSIFICAÇÃO</small><h3>Conta bancária dos movimentos</h3><p>A projeção consolidada considera todos os movimentos. A projeção por conta usa apenas os movimentos classificados.</p></div><button type="button" onClick={() => setShowAllMovements((value) => !value)}>{showAllMovements ? "Mostrar pendentes" : "Mostrar todos"}</button></header>
            {allocationRows.length ? <div className="treasury-table-wrap"><table><thead><tr><th>Vencimento</th><th>Tipo</th><th>Documento</th><th>Cliente / fornecedor</th><th>Valor aberto</th><th>Conta</th></tr></thead><tbody>{allocationRows.map((movement) => <tr key={movement.id}><td>{shortDate(movement.dueDate)}</td><td><span className={`treasury-kind ${movement.type}`}>{movement.type === "inflow" ? "Entrada" : "Saída"}</span></td><td><strong>{movement.document}</strong><small>{movement.detail}</small></td><td>{movement.counterpart}</td><td>{money(movement.scheduledAmount)}</td><td><select value={movement.bankAccountId ?? ""} onChange={(e) => void allocate(movement, e.target.value)} disabled={loading}><option value="">Sem conta</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>{movement.allocationSource === "billing" ? <small>Herdada do faturamento</small> : null}</td></tr>)}</tbody></table></div> : <p className="treasury-empty">Nenhum movimento pendente de classificação.</p>}
          </section>
        </div>
      </section>
    </div> : null}
  </>;
}
