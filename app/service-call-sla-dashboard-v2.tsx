"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type ServiceCall = {
  id: number;
  number: string;
  companyId: number | null;
  companyName: string;
  technician: string | null;
  serviceType: string;
  priority: string;
  status: string;
  createdAt: string;
};

type HistoryItem = {
  id: number;
  serviceCallId: number;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string;
  createdAt: string;
};

type Pendency = {
  id: number;
  serviceCallId: number;
  reason: string;
  notes: string | null;
  startedAt: string;
  endedAt: string | null;
};

type ServiceData = {
  calls: ServiceCall[];
  history: HistoryItem[];
  pendencies: Pendency[];
};

type SlaPolicy = {
  id: number;
  companyId: number | null;
  priority: string | null;
  serviceType: string | null;
  targetMinutes: number;
  pausePending: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type CompanyOption = { id: number; name: string };

type PolicyData = {
  policies: SlaPolicy[];
  companies: CompanyOption[];
  serviceTypes: string[];
};

type AppliedPolicy = {
  id: number | null;
  targetMinutes: number;
  pausePending: boolean;
  label: string;
};

type ComputedCall = ServiceCall & {
  elapsedMs: number;
  pendingMs: number;
  effectiveMs: number;
  targetMs: number;
  withinSla: boolean;
  isTerminal: boolean;
  firstActionMs: number | null;
  firstAttendanceMs: number | null;
  appliedPolicy: AppliedPolicy;
};

type RuleForm = {
  companyId: string;
  priority: string;
  serviceType: string;
  targetHours: string;
  pausePending: boolean;
};

const priorityLabels: Record<string, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

const fallbackMinutes: Record<string, number> = {
  critica: 240,
  alta: 480,
  media: 1440,
  baixa: 2880,
};

const pendingReasonLabels: Record<string, string> = {
  aguardando_cliente: "Aguardando cliente",
  aguardando_peca_material: "Peça / material",
  aguardando_acesso: "Aguardando acesso",
  aguardando_aprovacao: "Aguardando aprovação",
  reagendamento: "Reagendamento",
  terceiros: "Terceiros",
  outros: "Outros",
};

const emptyRuleForm: RuleForm = {
  companyId: "",
  priority: "",
  serviceType: "",
  targetHours: "24",
  pausePending: true,
};

function toMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function normalizePriority(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (normalized.includes("crit") || normalized.includes("urgent")) return "critica";
  if (normalized.includes("alta") || normalized.includes("high")) return "alta";
  if (normalized.includes("baix") || normalized.includes("low")) return "baixa";
  return "media";
}

function normalizeServiceType(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function formatServiceType(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return "Todas";
  return text.charAt(0).toUpperCase() + text.slice(1).replaceAll("_", " ");
}

function formatDuration(ms: number | null) {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

function formatTarget(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1).replace(".", ",")}h`;
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function average(values: Array<number | null>) {
  const valid = values.filter((item): item is number => item !== null && Number.isFinite(item));
  return valid.length ? valid.reduce((sum, item) => sum + item, 0) / valid.length : null;
}

function serviceViewVisible() {
  if (document.querySelector(".service-column, .service-call-card, .service-call-sheet")) return true;
  return Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3")).some((node) =>
    /chamados|ordens de servi[cç]o/i.test(node.textContent ?? ""),
  );
}

function findServiceHeaderActionTarget() {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) =>
    /novo chamado/i.test(item.textContent ?? ""),
  );
  return button?.parentElement ?? null;
}

function callEnd(call: ServiceCall, history: HistoryItem[], now: number) {
  if (call.status !== "concluido" && call.status !== "cancelado") return now;
  const finalEvent = history
    .filter(
      (item) =>
        item.serviceCallId === call.id &&
        (item.toStatus === "concluido" || item.toStatus === "cancelado"),
    )
    .sort((a, b) => (toMs(a.createdAt) ?? 0) - (toMs(b.createdAt) ?? 0))
    .at(-1);
  return toMs(finalEvent?.createdAt) ?? now;
}

function pendingTime(callId: number, pendencies: Pendency[], end: number) {
  return pendencies
    .filter((item) => item.serviceCallId === callId)
    .reduce((total, item) => {
      const start = toMs(item.startedAt);
      if (start === null) return total;
      const finish = Math.min(toMs(item.endedAt) ?? end, end);
      return total + Math.max(0, finish - start);
    }, 0);
}

function firstTransitionTime(call: ServiceCall, history: HistoryItem[], targets: string[]) {
  const created = toMs(call.createdAt);
  if (created === null) return null;
  const item = history
    .filter((entry) => entry.serviceCallId === call.id && targets.includes(entry.toStatus))
    .sort((a, b) => (toMs(a.createdAt) ?? 0) - (toMs(b.createdAt) ?? 0))[0];
  const reached = toMs(item?.createdAt);
  return reached === null ? null : Math.max(0, reached - created);
}

function policySpecificity(policy: SlaPolicy) {
  const count = Number(policy.companyId !== null) + Number(Boolean(policy.priority)) + Number(Boolean(policy.serviceType));
  const tieBreaker = Number(policy.companyId !== null) * 4 + Number(Boolean(policy.serviceType)) * 2 + Number(Boolean(policy.priority));
  return count * 10 + tieBreaker;
}

function policyMatches(policy: SlaPolicy, call: ServiceCall) {
  if (!policy.active) return false;
  if (policy.companyId !== null && policy.companyId !== call.companyId) return false;
  if (policy.priority && policy.priority !== normalizePriority(call.priority)) return false;
  if (policy.serviceType && normalizeServiceType(policy.serviceType) !== normalizeServiceType(call.serviceType)) return false;
  return true;
}

function policyLabel(policy: SlaPolicy, companies: CompanyOption[]) {
  const pieces: string[] = [];
  if (policy.companyId !== null) {
    pieces.push(companies.find((item) => item.id === policy.companyId)?.name ?? `Cliente #${policy.companyId}`);
  }
  if (policy.priority) pieces.push(priorityLabels[policy.priority] ?? policy.priority);
  if (policy.serviceType) pieces.push(formatServiceType(policy.serviceType));
  return pieces.length ? pieces.join(" · ") : "Regra geral";
}

function resolvePolicy(call: ServiceCall, policies: SlaPolicy[], companies: CompanyOption[]): AppliedPolicy {
  const matching = policies
    .filter((policy) => policyMatches(policy, call))
    .sort((a, b) => policySpecificity(b) - policySpecificity(a) || b.id - a.id);
  const selected = matching[0];
  if (selected) {
    return {
      id: selected.id,
      targetMinutes: selected.targetMinutes,
      pausePending: selected.pausePending,
      label: policyLabel(selected, companies),
    };
  }
  const priority = normalizePriority(call.priority);
  return {
    id: null,
    targetMinutes: fallbackMinutes[priority] ?? 1440,
    pausePending: true,
    label: `Fallback · ${priorityLabels[priority] ?? priority}`,
  };
}

export function ServiceCallSlaDashboardV2() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [data, setData] = useState<ServiceData>({ calls: [], history: [], pendencies: [] });
  const [policyData, setPolicyData] = useState<PolicyData>({ policies: [], companies: [], serviceTypes: [] });
  const [period, setPeriod] = useState<"7" | "30" | "90" | "all">("30");
  const [now, setNow] = useState(() => Date.now());
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleMessage, setRuleMessage] = useState("");
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const apply = () => {
      setVisible(serviceViewVisible());
      setHeaderTarget(findServiceHeaderActionTarget());
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh() {
    setLoading(true);
    setRuleMessage("");
    try {
      const [serviceResponse, policyResponse] = await Promise.all([
        fetch("/api/service-calls", { cache: "no-store" }),
        fetch("/api/service-call-sla-policies", { cache: "no-store" }),
      ]);
      if (serviceResponse.ok) {
        const payload = (await serviceResponse.json()) as Partial<ServiceData>;
        setData({ calls: payload.calls ?? [], history: payload.history ?? [], pendencies: payload.pendencies ?? [] });
      }
      if (policyResponse.ok) {
        const payload = (await policyResponse.json()) as Partial<PolicyData>;
        setPolicyData({ policies: payload.policies ?? [], companies: payload.companies ?? [], serviceTypes: payload.serviceTypes ?? [] });
      } else {
        const payload = (await policyResponse.json().catch(() => ({}))) as { error?: string };
        setRuleMessage(payload.error ?? "Não foi possível carregar as regras de SLA.");
      }
      setNow(Date.now());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  const serviceTypes = useMemo(() => {
    const values = new Set(policyData.serviceTypes.map(normalizeServiceType).filter(Boolean));
    data.calls.forEach((call) => {
      const value = normalizeServiceType(call.serviceType);
      if (value) values.add(value);
    });
    return [...values].sort();
  }, [policyData.serviceTypes, data.calls]);

  const computed = useMemo(() => {
    const cutoff = period === "all" ? 0 : now - Number(period) * 24 * 60 * 60 * 1000;
    return data.calls
      .filter((call) => (toMs(call.createdAt) ?? 0) >= cutoff)
      .map<ComputedCall>((call) => {
        const start = toMs(call.createdAt) ?? now;
        const end = callEnd(call, data.history, now);
        const elapsedMs = Math.max(0, end - start);
        const pendingMs = pendingTime(call.id, data.pendencies, end);
        const appliedPolicy = resolvePolicy(call, policyData.policies, policyData.companies);
        const effectiveMs = Math.max(0, elapsedMs - (appliedPolicy.pausePending ? pendingMs : 0));
        const targetMs = appliedPolicy.targetMinutes * 60000;
        return {
          ...call,
          elapsedMs,
          pendingMs,
          effectiveMs,
          targetMs,
          withinSla: effectiveMs <= targetMs,
          isTerminal: call.status === "concluido" || call.status === "cancelado",
          firstActionMs: firstTransitionTime(call, data.history, ["acionado"]),
          firstAttendanceMs: firstTransitionTime(call, data.history, ["atendimento"]),
          appliedPolicy,
        };
      });
  }, [data, period, policyData, now]);

  const metrics = useMemo(() => {
    const eligible = computed.filter((call) => call.status !== "cancelado");
    const concluded = eligible.filter((call) => call.status === "concluido");
    const active = eligible.filter((call) => !call.isTerminal);
    const outside = eligible.filter((call) => !call.withinSla);
    const within = eligible.length - outside.length;
    return {
      total: eligible.length,
      active: active.length,
      concluded: concluded.length,
      outside: outside.length,
      compliance: eligible.length ? (within / eligible.length) * 100 : 0,
      avgAction: average(eligible.map((call) => call.firstActionMs)),
      avgAttendance: average(eligible.map((call) => call.firstAttendanceMs)),
      avgResolution: average(concluded.map((call) => call.effectiveMs)),
      avgPending: average(eligible.map((call) => call.pendingMs)),
      pendingTotal: eligible.reduce((sum, call) => sum + call.pendingMs, 0),
    };
  }, [computed]);

  const technicianRanking = useMemo(() => {
    const map = new Map<string, ComputedCall[]>();
    computed.filter((call) => call.status !== "cancelado").forEach((call) => {
      const key = call.technician?.trim() || "Não atribuído";
      map.set(key, [...(map.get(key) ?? []), call]);
    });
    return [...map.entries()]
      .map(([name, calls]) => ({
        name,
        calls: calls.length,
        compliance: calls.length ? (calls.filter((call) => call.withinSla).length / calls.length) * 100 : 0,
        avg: average(calls.map((call) => call.effectiveMs)),
      }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 8);
  }, [computed]);

  const clientRanking = useMemo(() => {
    const map = new Map<string, ComputedCall[]>();
    computed.filter((call) => call.status !== "cancelado").forEach((call) => {
      const key = call.companyName?.trim() || "Cliente não informado";
      map.set(key, [...(map.get(key) ?? []), call]);
    });
    return [...map.entries()]
      .map(([name, calls]) => ({
        name,
        calls: calls.length,
        outside: calls.filter((call) => !call.withinSla).length,
        compliance: calls.length ? (calls.filter((call) => call.withinSla).length / calls.length) * 100 : 0,
      }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 8);
  }, [computed]);

  const pendingBreakdown = useMemo(() => {
    const ids = new Set(computed.map((call) => call.id));
    const map = new Map<string, number>();
    data.pendencies.filter((item) => ids.has(item.serviceCallId)).forEach((item) =>
      map.set(item.reason, (map.get(item.reason) ?? 0) + 1),
    );
    return [...map.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  }, [computed, data.pendencies]);

  const breaches = useMemo(
    () =>
      computed
        .filter((call) => call.status !== "cancelado" && !call.withinSla)
        .sort((a, b) => b.effectiveMs / Math.max(1, b.targetMs) - a.effectiveMs / Math.max(1, a.targetMs))
        .slice(0, 10),
    [computed],
  );

  function resetRuleForm() {
    setEditingRuleId(null);
    setRuleForm(emptyRuleForm);
    setRuleMessage("");
  }

  function editRule(policy: SlaPolicy) {
    setEditingRuleId(policy.id);
    setRuleForm({
      companyId: policy.companyId === null ? "" : String(policy.companyId),
      priority: policy.priority ?? "",
      serviceType: policy.serviceType ?? "",
      targetHours: String(policy.targetMinutes / 60),
      pausePending: policy.pausePending,
    });
    setShowRules(true);
    setRuleMessage("");
  }

  async function saveRule() {
    const targetHours = Number(ruleForm.targetHours);
    if (!Number.isFinite(targetHours) || targetHours <= 0) {
      setRuleMessage("Informe um prazo de SLA válido.");
      return;
    }
    setSavingRule(true);
    setRuleMessage("");
    try {
      const response = await fetch("/api/service-call-sla-policies", {
        method: editingRuleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRuleId ?? undefined,
          companyId: ruleForm.companyId || null,
          priority: ruleForm.priority || null,
          serviceType: ruleForm.serviceType || null,
          targetMinutes: Math.round(targetHours * 60),
          pausePending: ruleForm.pausePending,
          active: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setRuleMessage(payload.error ?? "Não foi possível salvar a regra de SLA.");
        return;
      }
      resetRuleForm();
      setRuleMessage(editingRuleId ? "Regra atualizada." : "Nova regra criada.");
      await refresh();
    } finally {
      setSavingRule(false);
    }
  }

  async function removeRule(policy: SlaPolicy) {
    if (!window.confirm(`Remover a regra “${policyLabel(policy, policyData.companies)}”?`)) return;
    setRuleMessage("");
    const response = await fetch(`/api/service-call-sla-policies?id=${policy.id}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setRuleMessage(payload.error ?? "Não foi possível remover a regra de SLA.");
      return;
    }
    if (editingRuleId === policy.id) resetRuleForm();
    setRuleMessage("Regra removida.");
    await refresh();
  }

  if (!visible) return null;

  const trigger = (
    <button
      className={`service-sla-trigger${headerTarget ? " service-sla-trigger-inline" : ""}`}
      type="button"
      onClick={() => setOpen(true)}
    >
      <span>SLA</span>
      <strong>Painel gerencial</strong>
    </button>
  );

  return (
    <>
      {headerTarget ? createPortal(trigger, headerTarget) : trigger}

      {open ? (
        <div
          className="service-sla-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section className="service-sla-dashboard" role="dialog" aria-modal="true" aria-label="Painel gerencial de SLA dos chamados">
            <header className="service-sla-header">
              <div>
                <small>CHAMADOS E ORDENS DE SERVIÇO</small>
                <h2>Painel gerencial de SLA</h2>
                <p>Desempenho operacional com regras centralizadas por cliente, prioridade e modalidade.</p>
              </div>
              <div className="service-sla-header-actions">
                <button type="button" onClick={() => setShowRules((value) => !value)}>{showRules ? "Ocultar regras" : "Configurar regras"}</button>
                <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
                <button className="service-sla-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
              </div>
            </header>

            <div className="service-sla-controls">
              <label>
                <span>Período</span>
                <select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}>
                  <option value="7">Últimos 7 dias</option>
                  <option value="30">Últimos 30 dias</option>
                  <option value="90">Últimos 90 dias</option>
                  <option value="all">Todo o histórico</option>
                </select>
              </label>
              <div className="service-sla-central-status">
                <strong>Regras centralizadas no banco</strong>
                <span>{policyData.policies.filter((item) => item.active).length} política(s) ativa(s) · regra mais específica prevalece</span>
              </div>
            </div>

            {showRules ? (
              <section className="service-sla-rules-manager">
                <header>
                  <div><small>CONFIGURAÇÃO CENTRAL</small><h3>Políticas de SLA</h3><p>Combine cliente, prioridade e modalidade. Campos em “Todos” funcionam como regra de fallback.</p></div>
                  {editingRuleId ? <button type="button" onClick={resetRuleForm}>Nova regra</button> : null}
                </header>

                <div className="service-sla-rule-form">
                  <label><span>Cliente</span><select value={ruleForm.companyId} onChange={(event) => setRuleForm((value) => ({ ...value, companyId: event.target.value }))}><option value="">Todos os clientes</option>{policyData.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
                  <label><span>Prioridade</span><select value={ruleForm.priority} onChange={(event) => setRuleForm((value) => ({ ...value, priority: event.target.value }))}><option value="">Todas</option>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label><span>Modalidade</span><select value={ruleForm.serviceType} onChange={(event) => setRuleForm((value) => ({ ...value, serviceType: event.target.value }))}><option value="">Todas</option>{serviceTypes.map((serviceType) => <option key={serviceType} value={serviceType}>{formatServiceType(serviceType)}</option>)}</select></label>
                  <label><span>SLA de resolução</span><div className="service-sla-hours-input"><input type="number" min="0.25" step="0.25" value={ruleForm.targetHours} onChange={(event) => setRuleForm((value) => ({ ...value, targetHours: event.target.value }))} /><em>horas</em></div></label>
                  <label className="service-sla-rule-pause"><input type="checkbox" checked={ruleForm.pausePending} onChange={(event) => setRuleForm((value) => ({ ...value, pausePending: event.target.checked }))} /><span>Pausar SLA durante pendência</span></label>
                  <button className="service-sla-save-rule" type="button" disabled={savingRule} onClick={() => void saveRule()}>{savingRule ? "Salvando…" : editingRuleId ? "Salvar alteração" : "+ Adicionar regra"}</button>
                </div>
                {ruleMessage ? <p className="service-sla-rule-message">{ruleMessage}</p> : null}

                <div className="service-sla-rules-table">
                  <div className="head"><span>Regra / escopo</span><span>Prazo</span><span>Pendência</span><span>Ações</span></div>
                  {policyData.policies.length ? policyData.policies.map((policy) => (
                    <div className="row" key={policy.id}>
                      <strong>{policyLabel(policy, policyData.companies)}</strong>
                      <span>{formatTarget(policy.targetMinutes)}</span>
                      <span>{policy.pausePending ? "Pausa o SLA" : "Continua contando"}</span>
                      <div><button type="button" onClick={() => editRule(policy)}>Editar</button><button className="danger" type="button" onClick={() => void removeRule(policy)}>Remover</button></div>
                    </div>
                  )) : <p className="empty">Nenhuma política cadastrada.</p>}
                </div>
              </section>
            ) : null}

            <div className="service-sla-kpis">
              <article><span>Cumprimento do SLA</span><strong>{percent(metrics.compliance)}</strong><small>{metrics.outside} fora do prazo · {metrics.total} avaliados</small></article>
              <article><span>Tempo até acionamento</span><strong>{formatDuration(metrics.avgAction)}</strong><small>Média desde a abertura</small></article>
              <article><span>Tempo até atendimento</span><strong>{formatDuration(metrics.avgAttendance)}</strong><small>Média até iniciar execução</small></article>
              <article><span>Tempo de resolução</span><strong>{formatDuration(metrics.avgResolution)}</strong><small>Média efetiva dos concluídos</small></article>
              <article className="pending"><span>Tempo médio pendente</span><strong>{formatDuration(metrics.avgPending)}</strong><small>{formatDuration(metrics.pendingTotal)} acumulado</small></article>
              <article><span>Carteira operacional</span><strong>{metrics.active}</strong><small>{metrics.concluded} concluídos no período</small></article>
            </div>

            <div className="service-sla-grid">
              <section className="service-sla-card service-sla-breach-card">
                <header><div><small>ATENÇÃO</small><h3>Chamados fora do SLA</h3></div><strong>{breaches.length ? `${metrics.outside} ocorrência(s)` : "Tudo dentro do prazo"}</strong></header>
                <div className="service-sla-breach-table">
                  <div className="head"><span>OS</span><span>Cliente</span><span>Prioridade / modalidade</span><span>Consumo / limite</span><span>Regra aplicada</span></div>
                  {breaches.length ? breaches.map((call) => (
                    <div className="row" key={call.id}>
                      <strong>{call.number}</strong>
                      <span>{call.companyName || "Não informado"}</span>
                      <span>{priorityLabels[normalizePriority(call.priority)]} · {formatServiceType(call.serviceType)}</span>
                      <span className="bad">{formatDuration(call.effectiveMs)} / {formatTarget(call.appliedPolicy.targetMinutes)}</span>
                      <span title={call.appliedPolicy.pausePending ? "Pendências pausam o relógio" : "Pendências contam no relógio"}>{call.appliedPolicy.label}</span>
                    </div>
                  )) : <p className="empty">Nenhum chamado fora do SLA no período selecionado.</p>}
                </div>
              </section>

              <section className="service-sla-card">
                <header><div><small>PRODUTIVIDADE</small><h3>Desempenho por técnico</h3></div></header>
                <div className="service-sla-table">
                  <div className="head"><span>Técnico</span><span>OS</span><span>SLA</span><span>Tempo médio</span></div>
                  {technicianRanking.length ? technicianRanking.map((item) => (
                    <div className="row" key={item.name}><strong>{item.name}</strong><span>{item.calls}</span><span className={item.compliance >= 90 ? "good" : item.compliance < 75 ? "bad" : ""}>{percent(item.compliance)}</span><span>{formatDuration(item.avg)}</span></div>
                  )) : <p className="empty">Sem dados no período selecionado.</p>}
                </div>
              </section>

              <section className="service-sla-card">
                <header><div><small>CLIENTES</small><h3>Volume e cumprimento por cliente</h3></div></header>
                <div className="service-sla-table">
                  <div className="head"><span>Cliente</span><span>OS</span><span>Fora</span><span>SLA</span></div>
                  {clientRanking.length ? clientRanking.map((item) => (
                    <div className="row" key={item.name}><strong>{item.name}</strong><span>{item.calls}</span><span>{item.outside}</span><span className={item.compliance >= 90 ? "good" : item.compliance < 75 ? "bad" : ""}>{percent(item.compliance)}</span></div>
                  )) : <p className="empty">Sem dados no período selecionado.</p>}
                </div>
              </section>

              <section className="service-sla-card service-sla-pending-card">
                <header><div><small>GARGALOS</small><h3>Motivos de pendência</h3></div><strong>{pendingBreakdown.reduce((sum, item) => sum + item.count, 0)} ocorrências</strong></header>
                <div className="service-sla-pending-bars">
                  {pendingBreakdown.length ? pendingBreakdown.map((item) => {
                    const max = pendingBreakdown[0]?.count || 1;
                    return <div key={item.reason}><span>{pendingReasonLabels[item.reason] ?? item.reason}</span><div><i style={{ width: `${Math.max(5, (item.count / max) * 100)}%` }} /></div><strong>{item.count}</strong></div>;
                  }) : <p className="empty">Nenhuma pendência registrada no período.</p>}
                </div>
              </section>
            </div>

            <footer className="service-sla-footer">
              <span>Cancelados não entram no cálculo de cumprimento.</span>
              <span>O SLA de cada OS é resolvido automaticamente pela política mais específica disponível.</span>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
