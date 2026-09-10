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
  actionMinutes: number | null;
  attendanceMinutes: number | null;
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
  actionMinutes: number | null;
  attendanceMinutes: number | null;
  resolutionMinutes: number;
  pausePending: boolean;
  label: string;
};

type ComputedCall = ServiceCall & {
  pendingMs: number;
  effectiveResolutionMs: number;
  actionMs: number | null;
  attendanceMs: number | null;
  actionCurrentMs: number;
  attendanceCurrentMs: number;
  resolutionTargetMs: number;
  actionTargetMs: number | null;
  attendanceTargetMs: number | null;
  actionWithinSla: boolean | null;
  attendanceWithinSla: boolean | null;
  resolutionWithinSla: boolean;
  isTerminal: boolean;
  appliedPolicy: AppliedPolicy;
};

type RuleForm = {
  companyId: string;
  priority: string;
  serviceType: string;
  actionHours: string;
  attendanceHours: string;
  resolutionHours: string;
  pausePending: boolean;
};

type StageName = "acionamento" | "atendimento" | "resolucao";

type RiskItem = {
  call: ComputedCall;
  stage: StageName;
  elapsedMs: number;
  targetMs: number;
  ratio: number;
};

const priorityLabels: Record<string, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

const fallbackResolutionMinutes: Record<string, number> = {
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
  actionHours: "",
  attendanceHours: "",
  resolutionHours: "24",
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

function formatTarget(minutes: number | null) {
  if (minutes === null) return "Não configurado";
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",")}h`;
}

function formatHoursInput(minutes: number | null) {
  if (minutes === null) return "";
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function average(values: Array<number | null>) {
  const valid = values.filter((item): item is number => item !== null && Number.isFinite(item));
  return valid.length ? valid.reduce((sum, item) => sum + item, 0) / valid.length : null;
}

function compliance(values: Array<boolean | null>) {
  const valid = values.filter((item): item is boolean => item !== null);
  if (!valid.length) return null;
  return (valid.filter(Boolean).length / valid.length) * 100;
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

function transitionAt(callId: number, history: HistoryItem[], target: string) {
  const item = history
    .filter((entry) => entry.serviceCallId === callId && entry.toStatus === target)
    .sort((a, b) => (toMs(a.createdAt) ?? 0) - (toMs(b.createdAt) ?? 0))[0];
  return toMs(item?.createdAt);
}

function pendingTimeUntil(callId: number, pendencies: Pendency[], end: number) {
  return pendencies
    .filter((item) => item.serviceCallId === callId)
    .reduce((total, item) => {
      const start = toMs(item.startedAt);
      if (start === null || start >= end) return total;
      const finish = Math.min(toMs(item.endedAt) ?? end, end);
      return total + Math.max(0, finish - start);
    }, 0);
}

function elapsedFromOpen(call: ServiceCall, end: number, pendencies: Pendency[], pausePending: boolean) {
  const start = toMs(call.createdAt) ?? end;
  const raw = Math.max(0, end - start);
  return Math.max(0, raw - (pausePending ? pendingTimeUntil(call.id, pendencies, end) : 0));
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
      actionMinutes: selected.actionMinutes ?? null,
      attendanceMinutes: selected.attendanceMinutes ?? null,
      resolutionMinutes: selected.targetMinutes,
      pausePending: selected.pausePending,
      label: policyLabel(selected, companies),
    };
  }
  const priority = normalizePriority(call.priority);
  return {
    id: null,
    actionMinutes: null,
    attendanceMinutes: null,
    resolutionMinutes: fallbackResolutionMinutes[priority] ?? 1440,
    pausePending: true,
    label: `Fallback · ${priorityLabels[priority] ?? priority}`,
  };
}

function stageLabel(stage: StageName) {
  if (stage === "acionamento") return "Acionamento";
  if (stage === "atendimento") return "Atendimento";
  return "Resolução";
}

export function ServiceCallSlaDashboardV3() {
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
        const appliedPolicy = resolvePolicy(call, policyData.policies, policyData.companies);
        const end = callEnd(call, data.history, now);
        const actionAt = transitionAt(call.id, data.history, "acionado");
        const attendanceAt = transitionAt(call.id, data.history, "atendimento");
        const actionMs = actionAt === null ? null : elapsedFromOpen(call, actionAt, data.pendencies, appliedPolicy.pausePending);
        const attendanceMs = attendanceAt === null ? null : elapsedFromOpen(call, attendanceAt, data.pendencies, appliedPolicy.pausePending);
        const actionCurrentMs = actionMs ?? elapsedFromOpen(call, now, data.pendencies, appliedPolicy.pausePending);
        const attendanceCurrentMs = attendanceMs ?? elapsedFromOpen(call, now, data.pendencies, appliedPolicy.pausePending);
        const effectiveResolutionMs = elapsedFromOpen(call, end, data.pendencies, appliedPolicy.pausePending);
        const pendingMs = pendingTimeUntil(call.id, data.pendencies, end);
        const actionTargetMs = appliedPolicy.actionMinutes === null ? null : appliedPolicy.actionMinutes * 60000;
        const attendanceTargetMs = appliedPolicy.attendanceMinutes === null ? null : appliedPolicy.attendanceMinutes * 60000;
        const resolutionTargetMs = appliedPolicy.resolutionMinutes * 60000;
        return {
          ...call,
          pendingMs,
          effectiveResolutionMs,
          actionMs,
          attendanceMs,
          actionCurrentMs,
          attendanceCurrentMs,
          resolutionTargetMs,
          actionTargetMs,
          attendanceTargetMs,
          actionWithinSla: actionTargetMs === null ? null : actionCurrentMs <= actionTargetMs,
          attendanceWithinSla: attendanceTargetMs === null ? null : attendanceCurrentMs <= attendanceTargetMs,
          resolutionWithinSla: effectiveResolutionMs <= resolutionTargetMs,
          isTerminal: call.status === "concluido" || call.status === "cancelado",
          appliedPolicy,
        };
      });
  }, [data, period, policyData, now]);

  const metrics = useMemo(() => {
    const eligible = computed.filter((call) => call.status !== "cancelado");
    const concluded = eligible.filter((call) => call.status === "concluido");
    return {
      total: eligible.length,
      actionCompliance: compliance(eligible.map((call) => call.actionWithinSla)),
      attendanceCompliance: compliance(eligible.map((call) => call.attendanceWithinSla)),
      resolutionCompliance: compliance(eligible.map((call) => call.resolutionWithinSla)),
      actionConfigured: eligible.filter((call) => call.actionTargetMs !== null).length,
      attendanceConfigured: eligible.filter((call) => call.attendanceTargetMs !== null).length,
      avgAction: average(eligible.map((call) => call.actionMs)),
      avgAttendance: average(eligible.map((call) => call.attendanceMs)),
      avgResolution: average(concluded.map((call) => call.effectiveResolutionMs)),
      pendingTotal: eligible.reduce((sum, call) => sum + call.pendingMs, 0),
    };
  }, [computed]);

  const riskItems = useMemo<RiskItem[]>(() => {
    const result: RiskItem[] = [];
    computed
      .filter((call) => call.status !== "cancelado" && call.status !== "concluido")
      .forEach((call) => {
        let stage: StageName = "resolucao";
        let elapsedMs = call.effectiveResolutionMs;
        let targetMs = call.resolutionTargetMs;
        if (call.actionMs === null && call.actionTargetMs !== null) {
          stage = "acionamento";
          elapsedMs = call.actionCurrentMs;
          targetMs = call.actionTargetMs;
        } else if (call.attendanceMs === null && call.attendanceTargetMs !== null) {
          stage = "atendimento";
          elapsedMs = call.attendanceCurrentMs;
          targetMs = call.attendanceTargetMs;
        }
        const ratio = elapsedMs / Math.max(1, targetMs);
        if (ratio >= 0.8) result.push({ call, stage, elapsedMs, targetMs, ratio });
      });
    return result.sort((a, b) => b.ratio - a.ratio).slice(0, 12);
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
        compliance: compliance(calls.map((call) => call.resolutionWithinSla)) ?? 0,
        avg: average(calls.filter((call) => call.status === "concluido").map((call) => call.effectiveResolutionMs)),
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
        outside: calls.filter((call) => !call.resolutionWithinSla).length,
        compliance: compliance(calls.map((call) => call.resolutionWithinSla)) ?? 0,
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
      actionHours: formatHoursInput(policy.actionMinutes),
      attendanceHours: formatHoursInput(policy.attendanceMinutes),
      resolutionHours: formatHoursInput(policy.targetMinutes),
      pausePending: policy.pausePending,
    });
    setShowRules(true);
    setRuleMessage("");
  }

  function optionalHoursToMinutes(value: string) {
    if (!value.trim()) return null;
    const hours = Number(value);
    return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : NaN;
  }

  async function saveRule() {
    const actionMinutes = optionalHoursToMinutes(ruleForm.actionHours);
    const attendanceMinutes = optionalHoursToMinutes(ruleForm.attendanceHours);
    const resolutionHours = Number(ruleForm.resolutionHours);
    if (Number.isNaN(actionMinutes)) {
      setRuleMessage("Informe um SLA de acionamento válido ou deixe o campo vazio.");
      return;
    }
    if (Number.isNaN(attendanceMinutes)) {
      setRuleMessage("Informe um SLA de atendimento válido ou deixe o campo vazio.");
      return;
    }
    if (!Number.isFinite(resolutionHours) || resolutionHours <= 0) {
      setRuleMessage("Informe um SLA de resolução válido.");
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
          actionMinutes,
          attendanceMinutes,
          targetMinutes: Math.round(resolutionHours * 60),
          pausePending: ruleForm.pausePending,
          active: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setRuleMessage(payload.error ?? "Não foi possível salvar a regra de SLA.");
        return;
      }
      const wasEditing = editingRuleId !== null;
      resetRuleForm();
      setRuleMessage(wasEditing ? "Regra atualizada." : "Nova regra criada.");
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
          <section className="service-sla-dashboard service-sla-dashboard-v3" role="dialog" aria-modal="true" aria-label="Painel gerencial de SLA dos chamados">
            <header className="service-sla-header">
              <div>
                <small>CHAMADOS E ORDENS DE SERVIÇO</small>
                <h2>Painel gerencial de SLA</h2>
                <p>Acionamento, atendimento e resolução controlados por políticas centralizadas.</p>
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
                <strong>SLA por etapa</strong>
                <span>{policyData.policies.filter((item) => item.active).length} política(s) ativa(s) · regra mais específica prevalece</span>
              </div>
            </div>

            {showRules ? (
              <section className="service-sla-rules-manager service-sla-rules-manager-v3">
                <header>
                  <div><small>CONFIGURAÇÃO CENTRAL</small><h3>Políticas de SLA</h3><p>Acionamento e atendimento são opcionais. Resolução mantém o prazo principal já existente.</p></div>
                  {editingRuleId ? <button type="button" onClick={resetRuleForm}>Nova regra</button> : null}
                </header>

                <div className="service-sla-rule-form service-sla-rule-form-v3">
                  <label><span>Cliente</span><select value={ruleForm.companyId} onChange={(event) => setRuleForm((value) => ({ ...value, companyId: event.target.value }))}><option value="">Todos os clientes</option>{policyData.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
                  <label><span>Prioridade</span><select value={ruleForm.priority} onChange={(event) => setRuleForm((value) => ({ ...value, priority: event.target.value }))}><option value="">Todas</option>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label><span>Modalidade</span><select value={ruleForm.serviceType} onChange={(event) => setRuleForm((value) => ({ ...value, serviceType: event.target.value }))}><option value="">Todas</option>{serviceTypes.map((serviceType) => <option key={serviceType} value={serviceType}>{formatServiceType(serviceType)}</option>)}</select></label>
                  <label><span>SLA acionamento</span><div className="service-sla-hours-input"><input type="number" min="0.25" step="0.25" placeholder="Opcional" value={ruleForm.actionHours} onChange={(event) => setRuleForm((value) => ({ ...value, actionHours: event.target.value }))} /><em>h</em></div></label>
                  <label><span>SLA atendimento</span><div className="service-sla-hours-input"><input type="number" min="0.25" step="0.25" placeholder="Opcional" value={ruleForm.attendanceHours} onChange={(event) => setRuleForm((value) => ({ ...value, attendanceHours: event.target.value }))} /><em>h</em></div></label>
                  <label><span>SLA resolução</span><div className="service-sla-hours-input"><input type="number" min="0.25" step="0.25" value={ruleForm.resolutionHours} onChange={(event) => setRuleForm((value) => ({ ...value, resolutionHours: event.target.value }))} /><em>h</em></div></label>
                  <label className="service-sla-rule-pause"><input type="checkbox" checked={ruleForm.pausePending} onChange={(event) => setRuleForm((value) => ({ ...value, pausePending: event.target.checked }))} /><span>Pausar SLA durante pendência</span></label>
                  <button className="service-sla-save-rule" type="button" disabled={savingRule} onClick={() => void saveRule()}>{savingRule ? "Salvando…" : editingRuleId ? "Salvar alteração" : "+ Adicionar regra"}</button>
                </div>
                {ruleMessage ? <p className="service-sla-rule-message">{ruleMessage}</p> : null}

                <div className="service-sla-rules-table service-sla-rules-table-v3">
                  <div className="head"><span>Regra / escopo</span><span>Acionamento</span><span>Atendimento</span><span>Resolução</span><span>Pendência</span><span>Ações</span></div>
                  {policyData.policies.length ? policyData.policies.map((policy) => (
                    <div className="row" key={policy.id}>
                      <strong>{policyLabel(policy, policyData.companies)}</strong>
                      <span>{formatTarget(policy.actionMinutes)}</span>
                      <span>{formatTarget(policy.attendanceMinutes)}</span>
                      <span>{formatTarget(policy.targetMinutes)}</span>
                      <span>{policy.pausePending ? "Pausa" : "Conta"}</span>
                      <div><button type="button" onClick={() => editRule(policy)}>Editar</button><button className="danger" type="button" onClick={() => void removeRule(policy)}>Remover</button></div>
                    </div>
                  )) : <p className="empty">Nenhuma política cadastrada.</p>}
                </div>
              </section>
            ) : null}

            <div className="service-sla-kpis service-sla-kpis-v3">
              <article><span>SLA acionamento</span><strong>{percent(metrics.actionCompliance)}</strong><small>{metrics.actionConfigured ? `${metrics.actionConfigured} chamado(s) com meta configurada` : "Configure a meta para começar a medir"}</small></article>
              <article><span>SLA atendimento</span><strong>{percent(metrics.attendanceCompliance)}</strong><small>{metrics.attendanceConfigured ? `${metrics.attendanceConfigured} chamado(s) com meta configurada` : "Configure a meta para começar a medir"}</small></article>
              <article><span>SLA resolução</span><strong>{percent(metrics.resolutionCompliance)}</strong><small>{metrics.total} chamado(s) avaliados</small></article>
              <article><span>Média até acionamento</span><strong>{formatDuration(metrics.avgAction)}</strong><small>Desde a abertura até Acionado</small></article>
              <article><span>Média até atendimento</span><strong>{formatDuration(metrics.avgAttendance)}</strong><small>Desde a abertura até Atendimento</small></article>
              <article><span>Média de resolução</span><strong>{formatDuration(metrics.avgResolution)}</strong><small>Pendências: {formatDuration(metrics.pendingTotal)} acumulado</small></article>
            </div>

            <div className="service-sla-grid">
              <section className="service-sla-card service-sla-breach-card">
                <header><div><small>ALERTA OPERACIONAL</small><h3>Chamados próximos do vencimento ou fora do SLA</h3></div><strong>{riskItems.length} em atenção</strong></header>
                <div className="service-sla-breach-table service-sla-risk-table">
                  <div className="head"><span>OS</span><span>Cliente</span><span>Etapa monitorada</span><span>Consumo</span><span>Situação</span><span>Regra</span></div>
                  {riskItems.length ? riskItems.map((item) => {
                    const remaining = Math.max(0, item.targetMs - item.elapsedMs);
                    const breached = item.ratio >= 1;
                    const critical = item.ratio >= 0.95 && !breached;
                    return (
                      <div className={`row ${breached ? "breached" : critical ? "critical" : "warning"}`} key={`${item.call.id}-${item.stage}`}>
                        <strong>{item.call.number}</strong>
                        <span>{item.call.companyName || "Não informado"}</span>
                        <span>{stageLabel(item.stage)}</span>
                        <span>{formatDuration(item.elapsedMs)} / {formatDuration(item.targetMs)}</span>
                        <span className={breached ? "bad" : "service-sla-risk-status"}>{breached ? `Estourado há ${formatDuration(item.elapsedMs - item.targetMs)}` : critical ? `Crítico · ${formatDuration(remaining)} restantes` : `Atenção · ${formatDuration(remaining)} restantes`}</span>
                        <span title={item.call.appliedPolicy.pausePending ? "Pendências pausam o relógio" : "Pendências contam no relógio"}>{item.call.appliedPolicy.label}</span>
                      </div>
                    );
                  }) : <p className="empty">Nenhum chamado consumiu 80% do próximo limite de SLA.</p>}
                </div>
              </section>

              <section className="service-sla-card">
                <header><div><small>PRODUTIVIDADE</small><h3>Resolução por técnico</h3></div></header>
                <div className="service-sla-table">
                  <div className="head"><span>Técnico</span><span>OS</span><span>SLA</span><span>Tempo médio</span></div>
                  {technicianRanking.length ? technicianRanking.map((item) => (
                    <div className="row" key={item.name}><strong>{item.name}</strong><span>{item.calls}</span><span className={item.compliance >= 90 ? "good" : item.compliance < 75 ? "bad" : ""}>{percent(item.compliance)}</span><span>{formatDuration(item.avg)}</span></div>
                  )) : <p className="empty">Sem dados no período selecionado.</p>}
                </div>
              </section>

              <section className="service-sla-card">
                <header><div><small>CLIENTES</small><h3>Resolução por cliente</h3></div></header>
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
              <span>Acionamento e atendimento só entram no percentual quando a política possui meta configurada.</span>
              <span>Alertas aparecem a partir de 80% do próximo limite aplicável.</span>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
