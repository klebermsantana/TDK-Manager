"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type EligibleItem = {
  assignmentId: number;
  technicianId: number;
  technicianName: string;
  supplierName: string | null;
  requiresInvoice: boolean;
  dueDays: number;
  serviceCallId: number;
  callNumber: string;
  companyName: string;
  location: string | null;
  serviceType: string;
  serviceDate: string;
  approvedAmount: number;
  laborAmount: number;
  reimbursementAmount: number;
  role: string;
  approvedAt: string | null;
};

type SettlementItem = {
  id: number;
  settlementId: number;
  assignmentId: number;
  serviceCallId: number;
  approvedAmountSnapshot: number;
  reimbursementSnapshot: number;
  settlementAmount: number;
  divergenceAmount: number;
  divergenceReason: string | null;
  callNumber: string | null;
  companyName: string | null;
  location: string | null;
  serviceType: string | null;
  serviceDate: string | null;
  role: string | null;
  assignmentStatus: string | null;
  apportionmentStatus: string | null;
};

type Settlement = {
  id: number;
  technicianId: number;
  technicianName: string;
  supplierName: string | null;
  requiresInvoice: boolean;
  periodFrom: string;
  periodTo: string;
  status: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  subtotal: number;
  reimbursementTotal: number;
  adjustmentTotal: number;
  totalAmount: number;
  itemCount: number;
  notes: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  dueDate: string | null;
  payableId: number | null;
  createdAt: string;
  items: SettlementItem[];
  payable: { id: number; groupNumber: string; amount: number; dueDate: string; paidAmount: number; paymentDate: string | null; status: string } | null;
};

type Technician = {
  id: number;
  name: string;
  supplierId: number | null;
  supplierName: string | null;
  requiresInvoice: boolean;
  dueDays: number;
};

type Payload = {
  technicians: Technician[];
  eligible: EligibleItem[];
  settlements: Settlement[];
  summary: {
    eligibleCount: number;
    eligibleTotal: number;
    draftCount: number;
    reviewCount: number;
    approvedCount: number;
    payableGeneratedCount: number;
    activeTotal: number;
    generatedTotal: number;
  };
};

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
const dateLabel = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "—";
const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em conferência",
  approved: "Aprovado",
  payable_generated: "Conta gerada",
  cancelled: "Cancelado",
};

function currentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(year, now.getMonth() + 1, 0).getDate();
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${String(last).padStart(2, "0")}` };
}

export function ServiceTechnicianSettlementDashboard() {
  const initial = useMemo(currentMonth, []);
  const [serviceTarget, setServiceTarget] = useState<HTMLElement | null>(null);
  const [payableTarget, setPayableTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"compose" | "history">("compose");
  const [period, setPeriod] = useState(initial);
  const [data, setData] = useState<Payload | null>(null);
  const [technicianId, setTechnicianId] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [selectedSettlementId, setSelectedSettlementId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const locate = () => {
      setServiceTarget(document.querySelector<HTMLElement>(".service-call-summary"));
      setPayableTarget(document.querySelector<HTMLElement>(".payable-metrics"));
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/service-technician-settlements?from=${period.from}&to=${period.to}`, { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar os fechamentos.");
      setData(payload);
      setAuthorized(true);
      if (!technicianId && payload.eligible?.[0]?.technicianId) setTechnicianId(String(payload.eligible[0].technicianId));
      if (!silent) setMessage("");
    } catch (error) {
      if (!silent) setMessage(error instanceof Error ? error.message : "Não foi possível carregar os fechamentos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if ((serviceTarget || payableTarget) && authorized === null) void refresh(true);
  }, [serviceTarget, payableTarget, authorized]);
  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  const eligible = (data?.eligible ?? []).filter((item) => !technicianId || item.technicianId === Number(technicianId));
  const selectedItems = eligible.filter((item) => selected.includes(item.assignmentId));
  const selectedTotal = selectedItems.reduce((sum, item) => sum + item.approvedAmount, 0);
  const selectedSettlement = data?.settlements.find((item) => item.id === selectedSettlementId) ?? null;

  useEffect(() => {
    setSelected((current) => current.filter((id) => eligible.some((item) => item.assignmentId === id)));
  }, [technicianId, data?.eligible]);

  async function createSettlement() {
    if (!technicianId || !selected.length) return setMessage("Selecione o técnico e ao menos uma OS.");
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/service-technician-settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId: Number(technicianId), periodFrom: period.from, periodTo: period.to, assignmentIds: selected }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível criar o fechamento.");
      setSelected([]);
      setSelectedSettlementId(payload.settlement.id);
      setTab("history");
      await refresh(true);
      setMessage("Fechamento criado em rascunho. Confira as linhas antes de enviar para aprovação.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar o fechamento.");
    } finally { setLoading(false); }
  }

  async function settlementAction(id: number, action: string, extra: Record<string, unknown> = {}) {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/service-technician-settlements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...extra }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar o fechamento.");
      await refresh(true);
      setMessage(
        action === "submit" ? "Fechamento enviado para conferência." :
        action === "approve" ? "Fechamento aprovado." :
        action === "generate_payable" ? "Conta a pagar consolidada gerada com sucesso." :
        action === "cancel" ? "Fechamento cancelado e OS liberadas para nova composição." :
        "Fechamento atualizado.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o fechamento.");
    } finally { setLoading(false); }
  }

  if (!serviceTarget && !payableTarget) return null;
  if (authorized === false) return null;

  const trigger = (context: "service" | "payable") => (
    <button type="button" className={`technician-settlement-trigger ${context}`} onClick={() => setOpen(true)}>
      <span>FECHAMENTOS TÉCNICOS</span>
      <strong>{data?.summary.eligibleCount ?? 0}</strong>
      <small>{context === "service" ? "OS prontas para consolidar" : "Conciliação com contas a pagar"}</small>
    </button>
  );

  return (
    <>
      {serviceTarget ? createPortal(trigger("service"), serviceTarget) : null}
      {payableTarget ? createPortal(trigger("payable"), payableTarget) : null}
      {open ? createPortal(
        <div className="technician-settlement-overlay" role="dialog" aria-modal="true">
          <div className="technician-settlement-panel">
            <header className="technician-settlement-head">
              <div>
                <small>OPERAÇÃO + FINANCEIRO</small>
                <h2>Fechamento de técnicos e parceiros</h2>
                <p>Consolide OS aprovadas, confira divergências e gere um único título financeiro por fechamento.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
            </header>

            <div className="technician-settlement-period">
              <label>De<input type="date" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} /></label>
              <label>Até<input type="date" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} /></label>
              <button type="button" disabled={loading} onClick={() => refresh()}>Atualizar período</button>
              <span>Somente OS concluídas, apuradas e aprovadas entram na composição.</span>
            </div>

            <div className="technician-settlement-kpis">
              <span><small>Prontas para fechar</small><strong>{data?.summary.eligibleCount ?? 0}</strong><b>{money(data?.summary.eligibleTotal ?? 0)}</b></span>
              <span><small>Em conferência</small><strong>{data?.summary.reviewCount ?? 0}</strong><b>aguardando validação</b></span>
              <span><small>Aprovados</small><strong>{data?.summary.approvedCount ?? 0}</strong><b>{money(data?.summary.activeTotal ?? 0)}</b></span>
              <span><small>Contas geradas</small><strong>{data?.summary.payableGeneratedCount ?? 0}</strong><b>{money(data?.summary.generatedTotal ?? 0)}</b></span>
            </div>

            <nav className="technician-settlement-tabs">
              <button className={tab === "compose" ? "active" : ""} onClick={() => setTab("compose")}>Compor fechamento</button>
              <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Fechamentos</button>
            </nav>

            {message ? <div className="technician-settlement-message">{message}</div> : null}

            {tab === "compose" ? (
              <section className="technician-settlement-compose">
                <div className="technician-settlement-compose-head">
                  <label>Técnico / parceiro
                    <select value={technicianId} onChange={(e) => { setTechnicianId(e.target.value); setSelected([]); }}>
                      <option value="">Selecione</option>
                      {(data?.technicians ?? []).map((tech) => <option key={tech.id} value={tech.id}>{tech.name}{tech.supplierName ? ` · ${tech.supplierName}` : ""}</option>)}
                    </select>
                  </label>
                  <div>
                    <button type="button" disabled={!eligible.length} onClick={() => setSelected(eligible.map((item) => item.assignmentId))}>Selecionar todas</button>
                    <button type="button" disabled={!selected.length} onClick={() => setSelected([])}>Limpar</button>
                  </div>
                </div>
                {technicianId && !data?.technicians.find((tech) => tech.id === Number(technicianId))?.supplierId ? (
                  <div className="technician-settlement-warning">Este técnico ainda não possui fornecedor vinculado. Você pode preparar o fechamento, mas a aprovação financeira ficará bloqueada até o vínculo ser feito.</div>
                ) : null}
                <div className="technician-settlement-lines">
                  {eligible.map((item) => (
                    <label key={item.assignmentId} className={selected.includes(item.assignmentId) ? "selected" : ""}>
                      <input type="checkbox" checked={selected.includes(item.assignmentId)} onChange={(e) => setSelected(e.target.checked ? [...selected, item.assignmentId] : selected.filter((id) => id !== item.assignmentId))} />
                      <span><strong>{item.callNumber}</strong><small>{dateLabel(item.serviceDate)} · {item.companyName}</small><em>{item.location || item.serviceType}</em></span>
                      <span><small>Mão de obra</small><strong>{money(item.laborAmount)}</strong></span>
                      <span><small>Reembolso</small><strong>{money(item.reimbursementAmount)}</strong></span>
                      <span><small>Total aprovado</small><strong>{money(item.approvedAmount)}</strong></span>
                    </label>
                  ))}
                  {!eligible.length ? <p>Nenhuma OS aprovada e disponível para este técnico no período.</p> : null}
                </div>
                <footer className="technician-settlement-compose-total">
                  <div><small>{selected.length} OS selecionada(s)</small><strong>{money(selectedTotal)}</strong></div>
                  <button type="button" disabled={loading || !selected.length} onClick={createSettlement}>{loading ? "Processando..." : "Criar fechamento em rascunho"}</button>
                </footer>
              </section>
            ) : (
              <section className="technician-settlement-history">
                <div className="technician-settlement-list">
                  {(data?.settlements ?? []).map((settlement) => (
                    <button type="button" key={settlement.id} className={`${settlement.status} ${selectedSettlementId === settlement.id ? "selected" : ""}`} onClick={() => setSelectedSettlementId(settlement.id)}>
                      <span><small>FECH #{String(settlement.id).padStart(5, "0")}</small><strong>{settlement.technicianName}</strong><em>{dateLabel(settlement.periodFrom)} a {dateLabel(settlement.periodTo)}</em></span>
                      <span><b className={`settlement-status ${settlement.status}`}>{statusLabels[settlement.status] ?? settlement.status}</b><strong>{money(settlement.totalAmount)}</strong><small>{settlement.itemCount} OS</small></span>
                    </button>
                  ))}
                  {!data?.settlements.length ? <p>Nenhum fechamento criado.</p> : null}
                </div>
                {selectedSettlement ? (
                  <SettlementDetail key={`${selectedSettlement.id}-${selectedSettlement.status}-${selectedSettlement.updatedAt ?? ""}`} settlement={selectedSettlement} loading={loading} action={settlementAction} />
                ) : <div className="technician-settlement-empty-detail">Selecione um fechamento para conferir as OS e o fluxo financeiro.</div>}
              </section>
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function SettlementDetail({ settlement, loading, action }: { settlement: Settlement; loading: boolean; action: (id: number, action: string, extra?: Record<string, unknown>) => Promise<void> }) {
  const [invoiceNumber, setInvoiceNumber] = useState(settlement.invoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(settlement.invoiceDate ?? "");
  const [notes, setNotes] = useState(settlement.notes ?? "");
  const editable = ["draft", "in_review"].includes(settlement.status);
  return (
    <div className="technician-settlement-detail">
      <header>
        <div><small>FECHAMENTO #{String(settlement.id).padStart(5, "0")}</small><h3>{settlement.technicianName}</h3><p>{settlement.supplierName || "Fornecedor ainda não vinculado"}</p></div>
        <b className={`settlement-status ${settlement.status}`}>{statusLabels[settlement.status] ?? settlement.status}</b>
      </header>
      <div className="technician-settlement-values">
        <span><small>Mão de obra</small><strong>{money(settlement.subtotal)}</strong></span>
        <span><small>Reembolsos</small><strong>{money(settlement.reimbursementTotal)}</strong></span>
        <span className={Math.abs(settlement.adjustmentTotal) >= 0.01 ? "attention" : ""}><small>Divergências</small><strong>{money(settlement.adjustmentTotal)}</strong></span>
        <span><small>Total do fechamento</small><strong>{money(settlement.totalAmount)}</strong></span>
      </div>
      <div className="technician-settlement-fiscal">
        <label>Número da NF<input value={invoiceNumber} disabled={!editable} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder={settlement.requiresInvoice ? "Obrigatório para aprovação" : "Opcional"} /></label>
        <label>Data da NF<input type="date" value={invoiceDate} disabled={!editable} onChange={(e) => setInvoiceDate(e.target.value)} /></label>
        <label>Observações<textarea value={notes} disabled={!editable} onChange={(e) => setNotes(e.target.value)} /></label>
        {editable ? <button type="button" disabled={loading} onClick={() => action(settlement.id, "update_header", { invoiceNumber, invoiceDate, notes })}>Salvar dados fiscais</button> : null}
      </div>
      {settlement.requiresInvoice && !settlement.invoiceNumber && settlement.status !== "cancelled" ? <div className="technician-settlement-warning">Este parceiro exige nota fiscal. A aprovação ficará bloqueada até o número da NF ser informado.</div> : null}
      <div className="technician-settlement-detail-lines">
        <div className="line-head"><span>OS / cliente</span><span>Aprovado</span><span>Reembolso</span><span>Fechamento</span><span>Divergência</span></div>
        {settlement.items.map((item) => <SettlementLine key={`${item.id}-${item.settlementAmount}`} item={item} editable={editable} loading={loading} settlementId={settlement.id} action={action} />)}
      </div>
      {settlement.payable ? (
        <div className="technician-settlement-payable">
          <span><small>Conta a pagar</small><strong>{settlement.payable.groupNumber}</strong></span>
          <span><small>Valor</small><strong>{money(settlement.payable.amount)}</strong></span>
          <span><small>Vencimento</small><strong>{dateLabel(settlement.payable.dueDate)}</strong></span>
          <span><small>Status</small><strong>{settlement.payable.status}</strong></span>
        </div>
      ) : settlement.dueDate ? <div className="technician-settlement-due">Vencimento previsto após aprovação: <strong>{dateLabel(settlement.dueDate)}</strong></div> : null}
      <footer className="technician-settlement-actions">
        {settlement.status === "draft" ? <button disabled={loading || !settlement.itemCount} onClick={() => action(settlement.id, "submit")}>Enviar para conferência</button> : null}
        {settlement.status === "in_review" ? <button disabled={loading} onClick={() => action(settlement.id, "approve")}>Aprovar fechamento</button> : null}
        {settlement.status === "approved" ? <><button className="secondary" disabled={loading} onClick={() => action(settlement.id, "return_to_review")}>Voltar para conferência</button><button disabled={loading} onClick={() => action(settlement.id, "generate_payable")}>Gerar conta a pagar consolidada</button></> : null}
        {["draft", "in_review", "approved"].includes(settlement.status) ? <button className="danger" disabled={loading} onClick={() => { if (window.confirm("Cancelar este fechamento e liberar as OS para nova composição?")) void action(settlement.id, "cancel"); }}>Cancelar fechamento</button> : null}
      </footer>
    </div>
  );
}

function SettlementLine({ item, editable, loading, settlementId, action }: { item: SettlementItem; editable: boolean; loading: boolean; settlementId: number; action: (id: number, action: string, extra?: Record<string, unknown>) => Promise<void> }) {
  const [amount, setAmount] = useState(String(item.settlementAmount));
  const [reason, setReason] = useState(item.divergenceReason ?? "");
  const dirty = Math.abs(Number(amount) - item.settlementAmount) >= 0.005 || reason !== (item.divergenceReason ?? "");
  const expectedDivergence = Number(amount || 0) - item.approvedAmountSnapshot;
  return (
    <div className="settlement-line">
      <span><strong>{item.callNumber ?? `OS #${item.serviceCallId}`}</strong><small>{dateLabel(item.serviceDate)} · {item.companyName ?? "Cliente"}</small><em>{item.location || item.serviceType || ""}</em></span>
      <span><strong>{money(item.approvedAmountSnapshot)}</strong></span>
      <span><strong>{money(item.reimbursementSnapshot)}</strong></span>
      <span>{editable ? <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /> : <strong>{money(item.settlementAmount)}</strong>}</span>
      <span className={Math.abs(item.divergenceAmount) >= 0.01 ? "attention" : ""}><strong>{money(editable ? expectedDivergence : item.divergenceAmount)}</strong>{editable && Math.abs(expectedDivergence) >= 0.01 ? <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo obrigatório" /> : item.divergenceReason ? <small>{item.divergenceReason}</small> : null}</span>
      {editable ? <div className="settlement-line-actions"><button disabled={loading || !dirty} onClick={() => action(settlementId, "update_item", { itemId: item.id, settlementAmount: Number(amount), divergenceReason: reason })}>Salvar</button><button className="danger" disabled={loading} onClick={() => { if (window.confirm(`Remover ${item.callNumber ?? "esta OS"} do fechamento?`)) void action(settlementId, "remove_item", { itemId: item.id }); }}>Remover</button></div> : null}
    </div>
  );
}
