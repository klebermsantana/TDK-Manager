"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type BankAccount = {
  id: number;
  name: string;
  bankName: string | null;
  currentBalance: number;
  balanceDate: string;
  active: boolean;
};

type RealizedEvent = {
  id: number;
  eventDate: string;
  amount: number;
  eventType: string;
  source: string;
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
  realizedEvents: RealizedEvent[];
  status: string;
  bankAccountId: number | null;
};

type FlowPayload = {
  movements: Movement[];
  dataQuality: {
    billingsWithoutInstallments: number;
    billingsWithoutDueDate: number;
    receivedWithoutPaymentDate: number;
    paidWithoutPaymentDate: number;
    movementsWithoutBankAccount: number;
    legacySnapshotEvents: number;
  };
};

type ClosingAccount = {
  accountId: number;
  accountName: string;
  bankName: string | null;
  bookBalance: number;
  statementBalance: number | null;
  closingDifference: number | null;
  reconciliationCoverage: number;
  statementTransactionCount: number;
  fullyAllocatedCount: number;
  unallocatedAmount: number;
  unknownLedgerEventCount: number;
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

type ClosingRecord = {
  id: number;
  bankAccountId: number;
  accountName: string;
  closingDate: string;
  status: "closed" | "reopened";
  bookBalance: number;
  reconciliationCoverage: number;
};

type OfficialPayload = {
  latestActive: ClosingRecord[];
  records: ClosingRecord[];
};

type Task = {
  id: number;
  bankAccountId: number | null;
  issueType: string;
  title: string;
  detail: string;
  recommendedAction: string;
  priority: "critical" | "high" | "medium";
  affectedAmount: number;
  status: "open" | "in_progress" | "waiting" | "resolved";
  assignedName: string | null;
  sourceActive: boolean;
  accountName: string;
};

type TasksPayload = {
  tasks: Task[];
  summary: {
    active: number;
    critical: number;
    high: number;
    medium: number;
    unassigned: number;
    inProgress: number;
    waiting: number;
    affectedAmount: number;
  };
};

type Horizon = 7 | 30 | 60 | 90;

type ExecutiveStatus = {
  key: "immediate" | "attention" | "controlled";
  label: string;
  reasons: string[];
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const percent = (value: number) => `${Number.isFinite(value) ? value.toFixed(0) : "0"}%`;
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const addDaysKey = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "—";

function projectedSummary(movements: Movement[], currentBalance: number, horizon: Horizon, accountId?: number) {
  const today = localDateKey();
  const limit = addDaysKey(horizon);
  const scoped = accountId ? movements.filter((item) => item.bankAccountId === accountId) : movements;
  const inflow = scoped
    .filter((item) => item.type === "inflow" && item.scheduledAmount > 0 && item.dueDate && item.dueDate >= today && item.dueDate <= limit)
    .reduce((sum, item) => sum + Number(item.scheduledAmount), 0);
  const outflow = scoped
    .filter((item) => item.type === "outflow" && item.scheduledAmount > 0 && item.dueDate && item.dueDate <= limit)
    .reduce((sum, item) => sum + Number(item.scheduledAmount), 0);
  return { inflow, outflow, net: inflow - outflow, projected: currentBalance + inflow - outflow };
}

export function TreasuryExecutiveDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [horizon, setHorizon] = useState<Horizon>(30);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [flow, setFlow] = useState<FlowPayload | null>(null);
  const [closing, setClosing] = useState<ClosingPayload | null>(null);
  const [official, setOfficial] = useState<OfficialPayload | null>(null);
  const [tasks, setTasks] = useState<TasksPayload | null>(null);
  const [message, setMessage] = useState("");

  const today = localDateKey();

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
      const responses = await Promise.all([
        fetch("/api/treasury-accounts", { cache: "no-store" }),
        fetch("/api/net-cash-flow", { cache: "no-store" }),
        fetch(`/api/treasury-closing?date=${encodeURIComponent(today)}`, { cache: "no-store" }),
        fetch("/api/treasury-official-closing", { cache: "no-store" }),
        fetch("/api/treasury-closing-tasks", { cache: "no-store" }),
      ]);
      if (responses.some((response) => response.status === 403)) {
        setAuthorized(false);
        return;
      }
      if (responses.some((response) => !response.ok)) {
        setMessage("Não foi possível consolidar todos os indicadores executivos da Tesouraria.");
        return;
      }
      const [accountsPayload, flowPayload, closingPayload, officialPayload, tasksPayload] = await Promise.all(responses.map((response) => response.json()));
      setAccounts((accountsPayload as { accounts?: BankAccount[] }).accounts ?? []);
      setFlow(flowPayload as FlowPayload);
      setClosing(closingPayload as ClosingPayload);
      setOfficial(officialPayload as OfficialPayload);
      setTasks(tasksPayload as TasksPayload);
      setAuthorized(true);
      setMessage("");
    } catch {
      setMessage("Não foi possível carregar o Painel Executivo da Tesouraria.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { if (target && authorized === null) void refresh(true); }, [target, authorized]);
  useEffect(() => { if (open) void refresh(); }, [open]);

  const activeAccounts = useMemo(() => accounts.filter((account) => account.active), [accounts]);
  const movements = flow?.movements ?? [];
  const currentBalance = useMemo(() => activeAccounts.reduce((sum, account) => sum + Number(account.currentBalance), 0), [activeAccounts]);
  const outlook = useMemo(() => projectedSummary(movements, currentBalance, horizon), [movements, currentBalance, horizon]);
  const horizons = useMemo(() => ([7, 30, 60, 90] as Horizon[]).map((days) => ({ days, ...projectedSummary(movements, currentBalance, days) })), [movements, currentBalance]);

  const overdue = useMemo(() => {
    const receivables = movements.filter((item) => item.type === "inflow" && item.scheduledAmount > 0 && item.dueDate && item.dueDate < today);
    const payables = movements.filter((item) => item.type === "outflow" && item.scheduledAmount > 0 && item.dueDate && item.dueDate < today);
    return {
      receivableAmount: receivables.reduce((sum, item) => sum + Number(item.scheduledAmount), 0),
      receivableCount: receivables.length,
      payableAmount: payables.reduce((sum, item) => sum + Number(item.scheduledAmount), 0),
      payableCount: payables.length,
    };
  }, [movements, today]);

  const realizedMonth = useMemo(() => {
    const key = monthKey();
    let inflow = 0;
    let outflow = 0;
    for (const movement of movements) {
      for (const event of movement.realizedEvents ?? []) {
        if (!event.eventDate.startsWith(key)) continue;
        if (movement.type === "inflow") inflow += Number(event.amount);
        else outflow += Number(event.amount);
      }
    }
    return { inflow, outflow, net: inflow - outflow };
  }, [movements]);

  const reconciliationCoverage = useMemo(() => {
    const rows = closing?.accounts ?? [];
    const transactionCount = rows.reduce((sum, account) => sum + Number(account.statementTransactionCount ?? 0), 0);
    const allocated = rows.reduce((sum, account) => sum + Number(account.fullyAllocatedCount ?? 0), 0);
    return transactionCount ? allocated / transactionCount * 100 : 100;
  }, [closing]);

  const activeTasks = useMemo(() => (tasks?.tasks ?? []).filter((task) => task.sourceActive && task.status !== "resolved"), [tasks]);
  const topTasks = useMemo(() => [...activeTasks].sort((a, b) => {
    const weight = { critical: 0, high: 1, medium: 2 } as const;
    const diff = weight[a.priority] - weight[b.priority];
    if (diff) return diff;
    return Math.abs(Number(b.affectedAmount)) - Math.abs(Number(a.affectedAmount));
  }).slice(0, 6), [activeTasks]);

  const executiveStatus = useMemo<ExecutiveStatus>(() => {
    const immediate: string[] = [];
    const attention: string[] = [];
    if ((tasks?.summary.critical ?? 0) > 0) immediate.push(`${tasks?.summary.critical} pendência(s) crítica(s) ativa(s)`);
    if (outlook.projected < -0.01) immediate.push(`saldo projetado de ${money(outlook.projected)} em ${horizon} dias`);
    if (Math.abs(Number(closing?.summary.closingDifference ?? 0)) > 0.01) immediate.push(`diferença consolidada de fechamento de ${money(Number(closing?.summary.closingDifference ?? 0))}`);

    if ((tasks?.summary.high ?? 0) > 0) attention.push(`${tasks?.summary.high} pendência(s) de prioridade alta`);
    if (overdue.payableAmount > 0.01) attention.push(`${money(overdue.payableAmount)} em contas a pagar vencidas`);
    if (overdue.receivableAmount > 0.01) attention.push(`${money(overdue.receivableAmount)} em recebíveis vencidos`);
    if (Number(closing?.summary.unallocatedStatementAmount ?? 0) > 0.01) attention.push(`${money(Number(closing?.summary.unallocatedStatementAmount ?? 0))} do extrato sem conciliação`);
    if ((flow?.dataQuality.movementsWithoutBankAccount ?? 0) > 0) attention.push(`${flow?.dataQuality.movementsWithoutBankAccount} movimento(s) sem conta bancária`);

    if (immediate.length) return { key: "immediate", label: "Ação imediata", reasons: immediate };
    if (attention.length) return { key: "attention", label: "Atenção", reasons: attention };
    return { key: "controlled", label: "Controlado", reasons: ["Sem sinal crítico pelos critérios executivos atuais."] };
  }, [tasks, outlook.projected, horizon, closing, overdue, flow]);

  const accountRows = useMemo(() => activeAccounts.map((account) => {
    const projection = projectedSummary(movements, Number(account.currentBalance), horizon, account.id);
    const diagnostic = closing?.accounts.find((item) => item.accountId === account.id) ?? null;
    const officialRecord = official?.latestActive.find((item) => item.bankAccountId === account.id) ?? null;
    const taskRows = activeTasks.filter((task) => task.bankAccountId === account.id);
    return {
      ...account,
      ...projection,
      diagnostic,
      officialRecord,
      criticalTasks: taskRows.filter((task) => task.priority === "critical").length,
      activeTasks: taskRows.length,
    };
  }).sort((a, b) => a.projected - b.projected), [activeAccounts, movements, horizon, closing, official, activeTasks]);

  function openTool(selector: string) {
    setOpen(false);
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(selector)?.click(), 0);
  }

  if (!target || authorized === false) return null;

  const trigger = <button type="button" className={`treasury-executive-trigger ${executiveStatus.key}`} onClick={() => setOpen(true)} disabled={authorized === null}>
    <span>EXECUTIVO</span>
    <strong>{authorized === null ? "Carregando" : money(outlook.projected)}</strong>
    <small>{authorized === null ? "Tesouraria" : `${executiveStatus.label} · ${horizon} dias`}</small>
  </button>;

  return <>
    {createPortal(trigger, target)}
    {open ? <div className="treasury-executive-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-executive-dashboard" role="dialog" aria-modal="true" aria-label="Painel Executivo da Tesouraria">
        <header className="treasury-executive-header">
          <div>
            <small>FINANCEIRO · VISÃO EXECUTIVA</small>
            <h2>Painel Executivo da Tesouraria</h2>
            <p>Consolida posição bancária informada, fluxo previsto, realizado, conciliação, pendências e fechamento. O status é determinado por regras visíveis — não por um score oculto.</p>
          </div>
          <div className="treasury-executive-actions">
            <label><span>Horizonte principal</span><select value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as Horizon)}><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option></select></label>
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
            <button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </header>

        {message ? <div className="treasury-executive-message">{message}</div> : null}

        <section className={`treasury-executive-status ${executiveStatus.key}`}>
          <div><small>SITUAÇÃO EXECUTIVA</small><h3>{executiveStatus.label}</h3><p>{executiveStatus.reasons[0]}</p></div>
          <div className="status-reasons">{executiveStatus.reasons.slice(1, 4).map((reason) => <span key={reason}>{reason}</span>)}</div>
        </section>

        <div className="treasury-executive-kpis">
          <article><span>Saldo atual informado</span><strong>{money(currentBalance)}</strong><small>{activeAccounts.length} conta(s) bancária(s) ativa(s)</small></article>
          <article className={outlook.inflow > 0 ? "good" : ""}><span>Entradas previstas</span><strong>{money(outlook.inflow)}</strong><small>a vencer em até {horizon} dias</small></article>
          <article><span>Saídas previstas</span><strong>{money(outlook.outflow)}</strong><small>inclui obrigações vencidas + horizonte</small></article>
          <article className={outlook.projected < 0 ? "danger" : "good"}><span>Saldo projetado</span><strong>{money(outlook.projected)}</strong><small>saldo atual + entradas − saídas</small></article>
          <article className={overdue.receivableAmount > 0 ? "warning" : "good"}><span>Recebíveis vencidos</span><strong>{money(overdue.receivableAmount)}</strong><small>{overdue.receivableCount} título(s) · fora da entrada projetada</small></article>
          <article className={overdue.payableAmount > 0 ? "danger" : "good"}><span>Pagamentos vencidos</span><strong>{money(overdue.payableAmount)}</strong><small>{overdue.payableCount} título(s) pressionando o caixa</small></article>
          <article className={(tasks?.summary.critical ?? 0) ? "danger" : (tasks?.summary.active ?? 0) ? "warning" : "good"}><span>Pendências de Tesouraria</span><strong>{tasks?.summary.active ?? 0}</strong><small>{tasks?.summary.critical ?? 0} crítica(s) · {tasks?.summary.unassigned ?? 0} sem responsável</small></article>
          <article className={reconciliationCoverage < 99.99 ? "warning" : "good"}><span>Conciliação do extrato</span><strong>{percent(reconciliationCoverage)}</strong><small>{money(Number(closing?.summary.unallocatedStatementAmount ?? 0))} ainda sem destino</small></article>
        </div>

        <div className="treasury-executive-grid">
          <section className="treasury-executive-card wide">
            <header><div><small>LIQUIDEZ PROGRAMADA</small><h3>Visão 7 / 30 / 60 / 90 dias</h3></div><strong>cenário conservador</strong></header>
            <div className="treasury-executive-horizons">
              {horizons.map((item) => <article key={item.days} className={item.projected < 0 ? "danger" : item.net < 0 ? "warning" : "good"}>
                <div><span>{item.days} dias</span><strong>{money(item.projected)}</strong></div>
                <small>Entradas {money(item.inflow)}</small>
                <small>Saídas {money(item.outflow)}</small>
                <b>{item.net >= 0 ? "+" : ""}{money(item.net)} no período</b>
              </article>)}
            </div>
            <p className="treasury-executive-note">Recebíveis vencidos não são empurrados artificialmente para o futuro; pagamentos vencidos permanecem como pressão imediata de caixa.</p>
          </section>

          <section className="treasury-executive-card">
            <header><div><small>REALIZADO</small><h3>Movimento do mês</h3></div><strong>Razão financeiro</strong></header>
            <div className="treasury-executive-realized">
              <article><span>Entrou</span><strong>{money(realizedMonth.inflow)}</strong></article>
              <article><span>Saiu</span><strong>{money(realizedMonth.outflow)}</strong></article>
              <article className={realizedMonth.net < 0 ? "danger" : "good"}><span>Líquido</span><strong>{money(realizedMonth.net)}</strong></article>
            </div>
            <small>Baseado em eventos individualizados do Razão, incluindo estornos no período.</small>
          </section>

          <section className="treasury-executive-card">
            <header><div><small>FECHAMENTO</small><h3>Governança da Tesouraria</h3></div><strong>{closing?.summary.readyAccounts ?? 0}/{closing?.summary.activeAccounts ?? 0} prontas</strong></header>
            <div className="treasury-executive-governance">
              <article><span>Contas conferidas hoje</span><strong>{closing?.summary.readyAccounts ?? 0}</strong></article>
              <article><span>Fechamentos oficiais ativos</span><strong>{official?.latestActive.length ?? 0}</strong></article>
              <article className={Math.abs(Number(closing?.summary.closingDifference ?? 0)) > 0.01 ? "danger" : "good"}><span>Diferença comparável</span><strong>{money(Number(closing?.summary.closingDifference ?? 0))}</strong></article>
              <article className={(closing?.summary.unknownLedgerEventCount ?? 0) ? "warning" : "good"}><span>Razão sem conta</span><strong>{closing?.summary.unknownLedgerEventCount ?? 0}</strong></article>
            </div>
          </section>

          <section className="treasury-executive-card wide">
            <header><div><small>CONTAS BANCÁRIAS</small><h3>Posição e pressão por conta</h3></div><strong>{accountRows.length} conta(s)</strong></header>
            <div className="treasury-executive-table">
              <div className="head"><span>Conta</span><span>Saldo atual</span><span>Entradas</span><span>Saídas</span><span>Projetado</span><span>Conciliação</span><span>Fechamento</span><span>Pendências</span></div>
              {accountRows.map((row) => <div className="row" key={row.id}>
                <div><strong>{row.name}</strong><small>{row.bankName ?? "Conta bancária"} · posição {shortDate(row.balanceDate)}</small></div>
                <span>{money(Number(row.currentBalance))}</span>
                <span className="positive">{money(row.inflow)}</span>
                <span>{money(row.outflow)}</span>
                <strong className={row.projected < 0 ? "negative" : "positive"}>{money(row.projected)}</strong>
                <span>{percent(Number(row.diagnostic?.reconciliationCoverage ?? 100))}</span>
                <span><b className={row.diagnostic?.ready ? "good-pill" : "warning-pill"}>{row.diagnostic?.ready ? "Conferida" : "Revisar"}</b>{row.officialRecord ? <small>oficial até {shortDate(row.officialRecord.closingDate)}</small> : <small>sem fechamento oficial</small>}</span>
                <span><b className={row.criticalTasks ? "danger-pill" : row.activeTasks ? "warning-pill" : "good-pill"}>{row.activeTasks}</b><small>{row.criticalTasks ? `${row.criticalTasks} crítica(s)` : "ativa(s)"}</small></span>
              </div>)}
              {!accountRows.length ? <p className="empty">Nenhuma conta bancária ativa cadastrada.</p> : null}
            </div>
          </section>

          <section className="treasury-executive-card wide priorities">
            <header><div><small>AÇÃO GERENCIAL</small><h3>Prioridades atuais</h3></div><strong>{activeTasks.length} pendência(s)</strong></header>
            {topTasks.length ? <div className="treasury-executive-priorities">
              {topTasks.map((task) => <article key={task.id} className={task.priority}>
                <b>{task.priority === "critical" ? "Crítica" : task.priority === "high" ? "Alta" : "Média"}</b>
                <div><strong>{task.title}</strong><small>{task.accountName} · {task.assignedName ? `Responsável: ${task.assignedName}` : "Sem responsável"}</small><p>{task.recommendedAction}</p></div>
                <span>{Number(task.affectedAmount) > 0.01 ? money(Number(task.affectedAmount)) : "—"}</span>
              </article>)}
            </div> : <div className="treasury-executive-empty-good"><strong>Nenhuma pendência técnica ativa.</strong><p>A fila de fechamento está limpa na conferência atual.</p></div>}
          </section>
        </div>

        <section className="treasury-executive-shortcuts">
          <button type="button" onClick={() => openTool(".treasury-trigger")}><span>TESOURARIA</span><strong>Contas e projeção</strong></button>
          <button type="button" onClick={() => openTool(".treasury-tasks-trigger")}><span>PENDÊNCIAS</span><strong>Fila operacional</strong></button>
          <button type="button" onClick={() => openTool(".recon-trigger")}><span>CONCILIAÇÃO</span><strong>Extrato x sistema</strong></button>
          <button type="button" onClick={() => openTool(".treasury-closing-trigger")}><span>FECHAMENTO</span><strong>Conferência técnica</strong></button>
        </section>

        <footer className="treasury-executive-footer">
          <span>Status executivo: Ação imediata = pendência crítica, diferença de fechamento ou saldo projetado negativo. Atenção = pendência alta, vencidos, conciliação incompleta ou classificação bancária pendente.</span>
          <span>Saldo projetado não substitui extrato ou saldo bancário confirmado; é uma projeção gerencial baseada nos movimentos cadastrados.</span>
        </footer>
      </section>
    </div> : null}
  </>;
}
