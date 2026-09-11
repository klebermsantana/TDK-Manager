"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Technician = {
  id: number;
  userId: number | null;
  supplierId: number | null;
  supplierName: string | null;
  linkedUserName: string | null;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  relationshipType: string;
  financialMode: string;
  paymentMethod: string | null;
  pixKey: string | null;
  dueDays: number;
  requiresInvoice: boolean;
  monthlyCost: number | null;
  monthlyProductiveHours: number;
  active: boolean;
  notes: string | null;
};
type RateRule = {
  id: number;
  technicianId: number | null;
  technicianName: string | null;
  companyId: number | null;
  companyName: string | null;
  serviceType: string | null;
  region: string | null;
  remunerationType: string;
  amount: number;
  minimumHours: number;
  nightSurchargePct: number;
  weekendSurchargePct: number;
  priority: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  active: boolean;
  notes: string | null;
};
type ServiceCall = {
  id: number;
  number: string;
  companyId: number | null;
  companyName: string;
  technician: string | null;
  serviceType: string;
  location: string | null;
  status: string;
  scheduledAt: string | null;
  subject: string;
};
type Assignment = {
  id: number;
  serviceCallId: number;
  technicianId: number;
  technicianName: string;
  relationshipType: string | null;
  financialMode: string | null;
  supplierName: string | null;
  role: string;
  assignmentStatus: string;
  hours: number;
  quantity: number;
  equipmentQty: number;
  negotiatedAmount: number | null;
  remunerationTypeSnapshot: string | null;
  rateAmountSnapshot: number | null;
  surchargeAmount: number;
  reimbursementAmount: number;
  expectedCost: number;
  realizedCost: number | null;
  costNature: string;
  apportionmentStatus: string;
  approvedBy: string | null;
  approvedAt: string | null;
  payableId: number | null;
  notes: string | null;
  callNumber: string | null;
  companyName: string | null;
  serviceType: string | null;
  callStatus: string | null;
  location: string | null;
  payable: { id: number; groupNumber: string; amount: number; dueDate: string; paidAmount: number; status: string } | null;
};
type RegistryPayload = {
  technicians: Technician[];
  rateRules: RateRule[];
  companies: Array<{ id: number; name: string }>;
  users: Array<{ id: number; name: string; email: string; jobTitle: string | null }>;
};

type TechnicianForm = {
  name: string; userId: string; relationshipType: string; financialMode: string; document: string; email: string; phone: string;
  paymentMethod: string; pixKey: string; dueDays: string; requiresInvoice: boolean; monthlyCost: string; monthlyProductiveHours: string; notes: string; active: boolean;
};
type RuleForm = {
  technicianId: string; companyId: string; serviceType: string; region: string; remunerationType: string; amount: string; minimumHours: string;
  nightSurchargePct: string; weekendSurchargePct: string; priority: string; effectiveFrom: string; effectiveTo: string; notes: string;
};

const money = (value: number | null | undefined) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
const relationshipLabels: Record<string, string> = { employee_clt: "Próprio CLT", employee_pj: "Próprio PJ", freelancer: "Freelancer / parceiro", partner_company: "Empresa parceira" };
const financialLabels: Record<string, string> = { managerial_only: "Custo gerencial", per_service: "Pagamento por atendimento", monthly_consolidated: "Consolidação mensal" };
const remunerationLabels: Record<string, string> = { per_visit: "Por visita", per_hour: "Por hora", daily: "Diária", fixed_service: "Valor fixo por serviço", per_equipment: "Por equipamento", monthly_allocation: "Rateio mensal / hora" };
const statusLabels: Record<string, string> = { planned: "Previsto", submitted: "Apurado", approved: "Aprovado", payable_generated: "Conta gerada", cancelled: "Cancelado" };
const callStatusLabels: Record<string, string> = { aberto: "Aberto", acionado: "Acionado", confirmado: "Confirmado", deslocamento: "Deslocamento", atendimento: "Em atendimento", pendente: "Pendente", concluido: "Concluído", cancelado: "Cancelado" };

const emptyTechnician: TechnicianForm = {
  name: "", userId: "", relationshipType: "freelancer", financialMode: "per_service", document: "", email: "", phone: "",
  paymentMethod: "pix", pixKey: "", dueDays: "7", requiresInvoice: false, monthlyCost: "", monthlyProductiveHours: "160", notes: "", active: true,
};
const emptyRule: RuleForm = {
  technicianId: "", companyId: "", serviceType: "", region: "", remunerationType: "per_visit", amount: "", minimumHours: "0",
  nightSurchargePct: "0", weekendSurchargePct: "0", priority: "0", effectiveFrom: "", effectiveTo: "", notes: "",
};

function readCallNumber(element: HTMLElement | null) {
  const match = element?.textContent?.match(/TDK-\d{6}/);
  return match?.[0] ?? null;
}

export function ServiceTechnicianCostDashboard() {
  const [summaryTarget, setSummaryTarget] = useState<HTMLElement | null>(null);
  const [sheetTarget, setSheetTarget] = useState<HTMLElement | null>(null);
  const [dialogTarget, setDialogTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"technicians" | "rates" | "apportionment">("technicians");
  const [registry, setRegistry] = useState<RegistryPayload>({ technicians: [], rateRules: [], companies: [], users: [] });
  const [calls, setCalls] = useState<ServiceCall[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [editingTechnicianId, setEditingTechnicianId] = useState<number | null>(null);
  const [technicianForm, setTechnicianForm] = useState<TechnicianForm>(emptyTechnician);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRule);
  const [assignmentForm, setAssignmentForm] = useState({ technicianId: "", role: "primary" });

  useEffect(() => {
    const locate = () => {
      setSummaryTarget(document.querySelector<HTMLElement>(".service-call-summary"));
      setSheetTarget(document.querySelector<HTMLElement>(".service-call-sheet .opportunity-sheet-body"));
      setDialogTarget(document.querySelector<HTMLElement>(".service-call-dialog form"));
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [registryResponse, callsResponse, assignmentsResponse] = await Promise.all([
        fetch("/api/service-technicians", { cache: "no-store" }),
        fetch("/api/service-calls", { cache: "no-store" }),
        fetch("/api/service-call-technicians", { cache: "no-store" }),
      ]);
      if (registryResponse.status === 403 || assignmentsResponse.status === 403) {
        setAuthorized(false);
        return;
      }
      const [registryData, callsData, assignmentsData] = await Promise.all([
        registryResponse.json(), callsResponse.json(), assignmentsResponse.json(),
      ]);
      if (!registryResponse.ok) throw new Error(registryData.error ?? "Não foi possível carregar técnicos.");
      if (!callsResponse.ok) throw new Error(callsData.error ?? "Não foi possível carregar OS.");
      if (!assignmentsResponse.ok) throw new Error(assignmentsData.error ?? "Não foi possível carregar apurações.");
      setRegistry(registryData);
      setCalls(callsData.calls ?? []);
      setAssignments(assignmentsData.assignments ?? []);
      setAuthorized(true);
      if (!silent) setMessage("");
    } catch (error) {
      if (!silent) setMessage(error instanceof Error ? error.message : "Não foi possível carregar a gestão de técnicos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { if (summaryTarget && authorized === null) void refresh(true); }, [summaryTarget, authorized]);
  useEffect(() => { if (open) void refresh(); }, [open]);

  const sheetCall = useMemo(() => {
    const number = readCallNumber(sheetTarget);
    return number ? calls.find((call) => call.number === number) ?? null : null;
  }, [sheetTarget, calls]);
  const dialogCall = useMemo(() => {
    const number = readCallNumber(dialogTarget);
    return number ? calls.find((call) => call.number === number) ?? null : null;
  }, [dialogTarget, calls]);
  const selectedCall = calls.find((call) => call.id === selectedCallId) ?? null;
  const selectedAssignments = assignments.filter((row) => row.serviceCallId === selectedCallId && row.assignmentStatus !== "cancelled");
  const activeAssignments = assignments.filter((row) => row.assignmentStatus !== "cancelled" && row.apportionmentStatus !== "cancelled");
  const pendingApproval = activeAssignments.filter((row) => !["approved", "payable_generated"].includes(row.apportionmentStatus)).length;
  const totalExpected = activeAssignments.reduce((sum, row) => sum + Number(row.realizedCost ?? row.expectedCost ?? 0), 0);
  const approvedCost = activeAssignments.filter((row) => ["approved", "payable_generated"].includes(row.apportionmentStatus)).reduce((sum, row) => sum + Number(row.realizedCost ?? row.expectedCost ?? 0), 0);

  function openForCall(call: ServiceCall | null) {
    if (call) setSelectedCallId(call.id);
    setTab("apportionment");
    setOpen(true);
  }

  async function saveTechnician(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/service-technicians", {
        method: editingTechnicianId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "technician", id: editingTechnicianId, ...technicianForm,
          userId: technicianForm.userId || null,
          dueDays: Number(technicianForm.dueDays), monthlyCost: technicianForm.monthlyCost === "" ? null : Number(technicianForm.monthlyCost),
          monthlyProductiveHours: Number(technicianForm.monthlyProductiveHours),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(editingTechnicianId ? "Perfil financeiro atualizado." : "Técnico cadastrado com perfil financeiro.");
      setEditingTechnicianId(null); setTechnicianForm(emptyTechnician); await refresh(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar o técnico."); }
    finally { setLoading(false); }
  }

  function editTechnician(tech: Technician) {
    setEditingTechnicianId(tech.id);
    setTechnicianForm({
      name: tech.name, userId: tech.userId ? String(tech.userId) : "", relationshipType: tech.relationshipType, financialMode: tech.financialMode,
      document: tech.document ?? "", email: tech.email ?? "", phone: tech.phone ?? "", paymentMethod: tech.paymentMethod ?? "", pixKey: tech.pixKey ?? "",
      dueDays: String(tech.dueDays), requiresInvoice: tech.requiresInvoice, monthlyCost: tech.monthlyCost === null ? "" : String(tech.monthlyCost),
      monthlyProductiveHours: String(tech.monthlyProductiveHours), notes: tech.notes ?? "", active: tech.active,
    });
    setTab("technicians");
  }

  async function toggleTechnician(tech: Technician) {
    const response = await fetch("/api/service-technicians", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "technician", id: tech.id, active: !tech.active }) });
    const data = await response.json(); if (!response.ok) return setMessage(data.error ?? "Não foi possível alterar o técnico.");
    await refresh(true);
  }

  async function saveRule(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/service-technicians", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action: "rate_rule", ...ruleForm, technicianId: ruleForm.technicianId || null, companyId: ruleForm.companyId || null,
        amount: Number(ruleForm.amount), minimumHours: Number(ruleForm.minimumHours), nightSurchargePct: Number(ruleForm.nightSurchargePct),
        weekendSurchargePct: Number(ruleForm.weekendSurchargePct), priority: Number(ruleForm.priority),
      }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setRuleForm(emptyRule); setMessage("Regra de remuneração cadastrada."); await refresh(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar a regra."); }
    finally { setLoading(false); }
  }

  async function toggleRule(rule: RateRule) {
    const response = await fetch("/api/service-technicians", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rate_rule", id: rule.id, active: !rule.active }) });
    const data = await response.json(); if (!response.ok) return setMessage(data.error ?? "Não foi possível alterar a regra.");
    await refresh(true);
  }

  async function assignTechnician() {
    if (!selectedCallId || !assignmentForm.technicianId) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/service-call-technicians", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        serviceCallId: selectedCallId, technicianId: Number(assignmentForm.technicianId), role: assignmentForm.role,
      }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setAssignmentForm({ technicianId: "", role: "support" }); setMessage(`Técnico vinculado. Custo previsto: ${money(data.calculation?.total)}.`); await refresh(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível vincular o técnico."); }
    finally { setLoading(false); }
  }

  async function mutateAssignment(id: number, payload: Record<string, unknown>) {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/service-call-technicians", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...payload }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const messages: Record<string, string> = { recalculate: "Custo previsto recalculado.", apportion: "Custo realizado apurado e enviado para aprovação.", approve: "Custo técnico aprovado.", generate_payable: "Conta a pagar gerada e vinculada à OS.", set_primary: "Técnico definido como principal.", cancel: "Vínculo técnico cancelado." };
      setMessage(messages[String(payload.action)] ?? "Apuração atualizada."); await refresh(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível atualizar a apuração."); }
    finally { setLoading(false); }
  }

  if (!summaryTarget || authorized === false) return null;
  const inlineCard = (call: ServiceCall | null, compact = false) => {
    if (!call) return null;
    const rows = assignments.filter((row) => row.serviceCallId === call.id && row.assignmentStatus !== "cancelled");
    const expected = rows.reduce((sum, row) => sum + Number(row.realizedCost ?? row.expectedCost ?? 0), 0);
    return <div className={`service-tech-inline ${compact ? "compact" : ""}`}>
      <div><span>EQUIPE TÉCNICA & CUSTO</span><strong>{rows.length ? `${rows.length} técnico(s) · ${money(expected)}` : "Nenhum técnico estruturado"}</strong><small>{rows.some((row) => !["approved", "payable_generated"].includes(row.apportionmentStatus)) ? "há custos aguardando apuração/aprovação" : rows.length ? "custos aprovados/financeiros atualizados" : "vincule o responsável e calcule o custo previsto"}</small></div>
      <button type="button" onClick={() => openForCall(call)}>Gerenciar</button>
    </div>;
  };

  return <>
    {createPortal(<button type="button" className="service-tech-cost-trigger" onClick={() => setOpen(true)}><span>TÉCNICOS & CUSTOS</span><strong>{pendingApproval}</strong><small>{pendingApproval ? `${money(totalExpected - approvedCost)} aguardando aprovação` : `${money(approvedCost)} aprovado`}</small></button>, summaryTarget)}
    {sheetTarget && sheetCall ? createPortal(inlineCard(sheetCall), sheetTarget) : null}
    {dialogTarget && dialogCall ? createPortal(inlineCard(dialogCall, true), dialogTarget) : null}

    {open ? <div className="service-tech-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="service-tech-dashboard" role="dialog" aria-modal="true" aria-label="Gestão de técnicos e custos de atendimento">
        <header className="service-tech-header">
          <div><small>OPERAÇÃO · FIELD SERVICE</small><h2>Gestão de técnicos e custos de atendimento</h2><p>Do custo previsto ao Contas a Pagar, preservando custo gerencial e negociações específicas.</p></div>
          <div><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button><button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button></div>
        </header>
        {message ? <div className="service-tech-message">{message}</div> : null}
        <div className="service-tech-kpis">
          <article><span>Técnicos ativos</span><strong>{registry.technicians.filter((row) => row.active).length}</strong><small>próprios e parceiros</small></article>
          <article><span>Custo em OS</span><strong>{money(totalExpected)}</strong><small>previsto/apurado atual</small></article>
          <article className={pendingApproval ? "warning" : "good"}><span>Aguardando aprovação</span><strong>{pendingApproval}</strong><small>{money(totalExpected - approvedCost)}</small></article>
          <article><span>Custo aprovado</span><strong>{money(approvedCost)}</strong><small>inclui títulos já gerados</small></article>
        </div>
        <nav className="service-tech-tabs">
          <button type="button" className={tab === "technicians" ? "active" : ""} onClick={() => setTab("technicians")}>Técnicos</button>
          <button type="button" className={tab === "rates" ? "active" : ""} onClick={() => setTab("rates")}>Tabelas de remuneração</button>
          <button type="button" className={tab === "apportionment" ? "active" : ""} onClick={() => setTab("apportionment")}>Apuração por OS</button>
        </nav>

        {tab === "technicians" ? <div className="service-tech-tab-body technicians">
          <form className="service-tech-form" onSubmit={saveTechnician}>
            <header><div><small>PERFIL FINANCEIRO</small><h3>{editingTechnicianId ? "Editar técnico" : "Novo técnico / parceiro"}</h3></div>{editingTechnicianId ? <button type="button" onClick={() => { setEditingTechnicianId(null); setTechnicianForm(emptyTechnician); }}>Cancelar edição</button> : null}</header>
            <label><span>Nome</span><input required value={technicianForm.name} onChange={(e) => setTechnicianForm({ ...technicianForm, name: e.target.value })} /></label>
            <div className="form-grid three">
              <label><span>Vínculo</span><select value={technicianForm.relationshipType} onChange={(e) => setTechnicianForm({ ...technicianForm, relationshipType: e.target.value })}>{Object.entries(relationshipLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>Tratamento financeiro</span><select value={technicianForm.financialMode} onChange={(e) => setTechnicianForm({ ...technicianForm, financialMode: e.target.value })}>{Object.entries(financialLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>Usuário TDK vinculado (opcional)</span><select value={technicianForm.userId} onChange={(e) => setTechnicianForm({ ...technicianForm, userId: e.target.value })}><option value="">Sem vínculo</option>{registry.users.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            </div>
            <div className="form-grid three"><label><span>CPF/CNPJ</span><input value={technicianForm.document} onChange={(e) => setTechnicianForm({ ...technicianForm, document: e.target.value })} /></label><label><span>E-mail</span><input type="email" value={technicianForm.email} onChange={(e) => setTechnicianForm({ ...technicianForm, email: e.target.value })} /></label><label><span>Telefone</span><input value={technicianForm.phone} onChange={(e) => setTechnicianForm({ ...technicianForm, phone: e.target.value })} /></label></div>
            <div className="form-grid four"><label><span>Forma de pagamento</span><select value={technicianForm.paymentMethod} onChange={(e) => setTechnicianForm({ ...technicianForm, paymentMethod: e.target.value })}><option value="pix">PIX</option><option value="transfer">Transferência</option><option value="invoice">NF / boleto</option><option value="payroll">Folha</option><option value="other">Outro</option></select></label><label><span>Chave PIX</span><input value={technicianForm.pixKey} onChange={(e) => setTechnicianForm({ ...technicianForm, pixKey: e.target.value })} /></label><label><span>Prazo para pagamento</span><input type="number" min="0" value={technicianForm.dueDays} onChange={(e) => setTechnicianForm({ ...technicianForm, dueDays: e.target.value })} /></label><label className="check"><input type="checkbox" checked={technicianForm.requiresInvoice} onChange={(e) => setTechnicianForm({ ...technicianForm, requiresInvoice: e.target.checked })} /><span>Exige nota fiscal</span></label></div>
            <div className="form-grid three"><label><span>Custo mensal gerencial (R$)</span><input type="number" min="0" step="0.01" value={technicianForm.monthlyCost} onChange={(e) => setTechnicianForm({ ...technicianForm, monthlyCost: e.target.value })} /></label><label><span>Horas produtivas/mês</span><input type="number" min="1" step="0.5" value={technicianForm.monthlyProductiveHours} onChange={(e) => setTechnicianForm({ ...technicianForm, monthlyProductiveHours: e.target.value })} /></label><label className="check"><input type="checkbox" checked={technicianForm.active} onChange={(e) => setTechnicianForm({ ...technicianForm, active: e.target.checked })} /><span>Ativo para novos atendimentos</span></label></div>
            <label><span>Observações / negociação</span><textarea value={technicianForm.notes} onChange={(e) => setTechnicianForm({ ...technicianForm, notes: e.target.value })} /></label>
            <button className="primary" disabled={loading}>{editingTechnicianId ? "Salvar perfil" : "Cadastrar técnico"}</button>
          </form>
          <section className="technician-list"><header><small>BASE DE TÉCNICOS</small><h3>{registry.technicians.length} cadastro(s)</h3></header>{registry.technicians.length ? registry.technicians.map((tech) => <article key={tech.id} className={!tech.active ? "inactive" : ""}><div className="tech-main"><span>{relationshipLabels[tech.relationshipType] ?? tech.relationshipType}</span><strong>{tech.name}</strong><small>{financialLabels[tech.financialMode] ?? tech.financialMode}{tech.supplierName ? ` · fornecedor ${tech.supplierName}` : ""}</small></div><div className="tech-finance"><b>{tech.monthlyCost ? `${money(tech.monthlyCost)}/mês` : tech.financialMode === "per_service" ? "por regra/OS" : "sem custo mensal"}</b><small>{tech.requiresInvoice ? "NF obrigatória" : "NF não obrigatória"} · D+{tech.dueDays}</small></div><div className="row-actions"><button type="button" onClick={() => editTechnician(tech)}>Editar</button><button type="button" onClick={() => void toggleTechnician(tech)}>{tech.active ? "Desativar" : "Reativar"}</button></div></article>) : <p>Nenhum técnico cadastrado.</p>}</section>
        </div> : null}

        {tab === "rates" ? <div className="service-tech-tab-body rates">
          <form className="service-tech-form" onSubmit={saveRule}>
            <header><div><small>TABELA DE REMUNERAÇÃO</small><h3>Nova regra de valor</h3><p>Quanto mais específica a regra, maior a prioridade automática.</p></div></header>
            <div className="form-grid two"><label><span>Técnico</span><select value={ruleForm.technicianId} onChange={(e) => setRuleForm({ ...ruleForm, technicianId: e.target.value })}><option value="">Padrão TDK / qualquer técnico</option>{registry.technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select></label><label><span>Cliente (opcional)</span><select value={ruleForm.companyId} onChange={(e) => setRuleForm({ ...ruleForm, companyId: e.target.value })}><option value="">Todos os clientes</option>{registry.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label></div>
            <div className="form-grid three"><label><span>Modalidade (opcional)</span><select value={ruleForm.serviceType} onChange={(e) => setRuleForm({ ...ruleForm, serviceType: e.target.value })}><option value="">Todas</option><option value="visita">Visita técnica</option><option value="remoto">Remoto</option><option value="instalacao">Instalação</option><option value="manutencao">Manutenção</option><option value="vistoria">Vistoria</option></select></label><label><span>Região / texto do local (opcional)</span><input value={ruleForm.region} onChange={(e) => setRuleForm({ ...ruleForm, region: e.target.value })} placeholder="Ex.: Campinas, SP" /></label><label><span>Prioridade adicional</span><input type="number" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })} /></label></div>
            <div className="form-grid four"><label><span>Forma de remuneração</span><select value={ruleForm.remunerationType} onChange={(e) => setRuleForm({ ...ruleForm, remunerationType: e.target.value })}>{Object.entries(remunerationLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Valor base (R$)</span><input required type="number" min="0" step="0.01" value={ruleForm.amount} onChange={(e) => setRuleForm({ ...ruleForm, amount: e.target.value })} /></label><label><span>Mínimo de horas</span><input type="number" min="0" step="0.5" value={ruleForm.minimumHours} onChange={(e) => setRuleForm({ ...ruleForm, minimumHours: e.target.value })} /></label><label><span>Adicional noturno %</span><input type="number" min="0" step="0.1" value={ruleForm.nightSurchargePct} onChange={(e) => setRuleForm({ ...ruleForm, nightSurchargePct: e.target.value })} /></label></div>
            <div className="form-grid three"><label><span>Adicional fim de semana %</span><input type="number" min="0" step="0.1" value={ruleForm.weekendSurchargePct} onChange={(e) => setRuleForm({ ...ruleForm, weekendSurchargePct: e.target.value })} /></label><label><span>Vigência de</span><input type="date" value={ruleForm.effectiveFrom} onChange={(e) => setRuleForm({ ...ruleForm, effectiveFrom: e.target.value })} /></label><label><span>Vigência até</span><input type="date" value={ruleForm.effectiveTo} onChange={(e) => setRuleForm({ ...ruleForm, effectiveTo: e.target.value })} /></label></div>
            <label><span>Observações da negociação</span><textarea value={ruleForm.notes} onChange={(e) => setRuleForm({ ...ruleForm, notes: e.target.value })} /></label>
            <button className="primary" disabled={loading}>Cadastrar regra</button>
          </form>
          <section className="rate-list"><header><small>REGRAS ATIVAS E HISTÓRICO</small><h3>{registry.rateRules.length} regra(s)</h3></header>{registry.rateRules.length ? registry.rateRules.map((rule) => <article key={rule.id} className={!rule.active ? "inactive" : ""}><div><span>{rule.technicianName ?? "Padrão TDK"}</span><strong>{remunerationLabels[rule.remunerationType] ?? rule.remunerationType} · {money(rule.amount)}</strong><small>{[rule.companyName, rule.serviceType, rule.region].filter(Boolean).join(" · ") || "Regra geral"}</small></div><div><b>Prioridade {rule.priority}</b><small>{rule.minimumHours ? `mín. ${rule.minimumHours}h · ` : ""}{rule.nightSurchargePct ? `noturno +${rule.nightSurchargePct}% · ` : ""}{rule.weekendSurchargePct ? `fim semana +${rule.weekendSurchargePct}%` : ""}</small></div><button type="button" onClick={() => void toggleRule(rule)}>{rule.active ? "Desativar" : "Reativar"}</button></article>) : <p>Nenhuma regra cadastrada.</p>}</section>
        </div> : null}

        {tab === "apportionment" ? <div className="service-tech-tab-body apportionment">
          <section className="call-selector"><label><span>Ordem de serviço</span><select value={selectedCallId ?? ""} onChange={(e) => setSelectedCallId(Number(e.target.value) || null)}><option value="">Selecione uma OS</option>{calls.map((call) => <option key={call.id} value={call.id}>{call.number} · {call.companyName} · {callStatusLabels[call.status] ?? call.status}</option>)}</select></label>{selectedCall ? <div><strong>{selectedCall.subject}</strong><small>{selectedCall.companyName} · {selectedCall.location || "Local não informado"} · {selectedCall.serviceType}</small></div> : null}</section>
          {selectedCall ? <>
            <section className="assignment-add"><div><small>EQUIPE DA OS</small><strong>Adicionar técnico</strong><p>O técnico principal sincroniza com o responsável já exibido no chamado.</p></div><select value={assignmentForm.technicianId} onChange={(e) => setAssignmentForm({ ...assignmentForm, technicianId: e.target.value })}><option value="">Selecione o técnico</option>{registry.technicians.filter((tech) => tech.active && !selectedAssignments.some((row) => row.technicianId === tech.id)).map((tech) => <option key={tech.id} value={tech.id}>{tech.name} · {financialLabels[tech.financialMode]}</option>)}</select><select value={assignmentForm.role} onChange={(e) => setAssignmentForm({ ...assignmentForm, role: e.target.value })}><option value="primary">Principal</option><option value="support">Apoio</option></select><button type="button" className="primary" disabled={loading || !assignmentForm.technicianId} onClick={() => void assignTechnician()}>Vincular técnico</button></section>
            <div className="call-cost-summary"><span><small>Previsto / apurado</small><strong>{money(selectedAssignments.reduce((sum,row) => sum + Number(row.realizedCost ?? row.expectedCost),0))}</strong></span><span><small>Aprovado</small><strong>{money(selectedAssignments.filter(row => ["approved","payable_generated"].includes(row.apportionmentStatus)).reduce((sum,row) => sum + Number(row.realizedCost ?? row.expectedCost),0))}</strong></span><span><small>Equipe</small><strong>{selectedAssignments.length}</strong></span></div>
            <section className="assignment-list">{selectedAssignments.length ? selectedAssignments.map((row) => <AssignmentCard key={`${row.id}-${row.apportionmentStatus}-${row.expectedCost}`} row={row} call={selectedCall} busy={loading} mutate={mutateAssignment} />) : <div className="empty-assignment"><strong>Nenhum técnico estruturado nesta OS.</strong><p>Vincule o responsável para calcular o custo previsto.</p></div>}</section>
          </> : <div className="empty-assignment"><strong>Selecione uma OS para apurar a equipe técnica.</strong></div>}
        </div> : null}
        <footer className="service-tech-footer">Atribuir um técnico gera apenas custo previsto. O Contas a Pagar só nasce após OS concluída, apuração do realizado, aprovação e ação explícita de gerar o título.</footer>
      </section>
    </div> : null}
  </>;
}

function AssignmentCard({ row, call, busy, mutate }: { row: Assignment; call: ServiceCall; busy: boolean; mutate: (id: number, payload: Record<string, unknown>) => Promise<void> }) {
  const [draft, setDraft] = useState({
    hours: String(row.hours), quantity: String(row.quantity), equipmentQty: String(row.equipmentQty),
    negotiatedAmount: row.negotiatedAmount === null ? "" : String(row.negotiatedAmount), reimbursementAmount: String(row.reimbursementAmount), notes: row.notes ?? "",
  });
  useEffect(() => setDraft({ hours: String(row.hours), quantity: String(row.quantity), equipmentQty: String(row.equipmentQty), negotiatedAmount: row.negotiatedAmount === null ? "" : String(row.negotiatedAmount), reimbursementAmount: String(row.reimbursementAmount), notes: row.notes ?? "" }), [row.id, row.hours, row.quantity, row.equipmentQty, row.negotiatedAmount, row.reimbursementAmount, row.notes]);
  const payload = { hours: Number(draft.hours), quantity: Number(draft.quantity), equipmentQty: Number(draft.equipmentQty), negotiatedAmount: draft.negotiatedAmount === "" ? null : Number(draft.negotiatedAmount), reimbursementAmount: Number(draft.reimbursementAmount), notes: draft.notes };
  const locked = Boolean(row.payableId) || row.apportionmentStatus === "payable_generated";
  return <article className={`assignment-card ${row.apportionmentStatus}`}>
    <header><div><span>{row.role === "primary" ? "PRINCIPAL" : "APOIO"}</span><strong>{row.technicianName}</strong><small>{relationshipLabels[row.relationshipType ?? ""] ?? row.relationshipType} · {financialLabels[row.financialMode ?? ""] ?? row.financialMode}</small></div><b>{statusLabels[row.apportionmentStatus] ?? row.apportionmentStatus}</b></header>
    <div className="assignment-values"><span><small>Forma</small><strong>{remunerationLabels[row.remunerationTypeSnapshot ?? ""] ?? row.remunerationTypeSnapshot ?? "Sem regra"}</strong></span><span><small>Taxa base</small><strong>{money(row.rateAmountSnapshot)}</strong></span><span><small>Previsto</small><strong>{money(row.expectedCost)}</strong></span><span><small>Realizado</small><strong>{row.realizedCost === null ? "—" : money(row.realizedCost)}</strong></span></div>
    <div className="assignment-form"><label><span>Horas</span><input disabled={locked} type="number" min="0" step="0.25" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} /></label><label><span>Qtd./visitas/dias</span><input disabled={locked} type="number" min="0" step="0.25" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} /></label><label><span>Equipamentos</span><input disabled={locked} type="number" min="0" step="1" value={draft.equipmentQty} onChange={(e) => setDraft({ ...draft, equipmentQty: e.target.value })} /></label><label><span>Valor negociado (R$)</span><input disabled={locked} type="number" min="0" step="0.01" value={draft.negotiatedAmount} placeholder="usar tabela" onChange={(e) => setDraft({ ...draft, negotiatedAmount: e.target.value })} /></label><label><span>Reembolsos (R$)</span><input disabled={locked} type="number" min="0" step="0.01" value={draft.reimbursementAmount} onChange={(e) => setDraft({ ...draft, reimbursementAmount: e.target.value })} /></label><label><span>Observação</span><input disabled={locked} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label></div>
    <div className="assignment-breakdown"><span>Adicionais: <b>{money(row.surchargeAmount)}</b></span><span>Reembolso: <b>{money(row.reimbursementAmount)}</b></span><span>Natureza: <b>{row.costNature === "payable" ? "gera obrigação financeira após aprovação" : "custo gerencial"}</b></span>{row.payable ? <span className="payable-link">Título {row.payable.groupNumber} · {money(row.payable.amount)} · vence {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${row.payable.dueDate}T12:00:00Z`))}</span> : null}</div>
    <div className="assignment-actions">
      {!locked ? <><button type="button" disabled={busy} onClick={() => void mutate(row.id, { action: "recalculate", ...payload })}>Recalcular previsão</button><button type="button" className="primary" disabled={busy} onClick={() => void mutate(row.id, { action: "apportion", ...payload })}>Apurar realizado</button></> : null}
      {row.role !== "primary" && !locked ? <button type="button" disabled={busy} onClick={() => void mutate(row.id, { action: "set_primary" })}>Tornar principal</button> : null}
      {row.apportionmentStatus === "submitted" ? <button type="button" className="approve" disabled={busy || call.status !== "concluido"} title={call.status !== "concluido" ? "Conclua a OS para aprovar" : ""} onClick={() => void mutate(row.id, { action: "approve" })}>Aprovar custo</button> : null}
      {row.apportionmentStatus === "approved" && row.financialMode === "per_service" ? <button type="button" className="payable" disabled={busy} onClick={() => void mutate(row.id, { action: "generate_payable" })}>Gerar conta a pagar</button> : null}
      {row.apportionmentStatus === "approved" && row.financialMode === "managerial_only" ? <em>Custo gerencial aprovado · sem título por OS</em> : null}
      {row.apportionmentStatus === "approved" && row.financialMode === "monthly_consolidated" ? <em>Aprovado · aguardará consolidação mensal</em> : null}
      {!locked ? <button type="button" className="danger" disabled={busy} onClick={() => { if (window.confirm(`Cancelar ${row.technicianName} desta OS?`)) void mutate(row.id, { action: "cancel" }); }}>Cancelar vínculo</button> : null}
    </div>
  </article>;
}
