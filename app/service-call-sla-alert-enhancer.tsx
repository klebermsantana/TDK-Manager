"use client";

import { useEffect } from "react";

type ServiceCall = {
  id: number;
  number: string;
  companyId: number | null;
  priority: string;
  serviceType: string;
  status: string;
  createdAt: string;
};

type HistoryItem = {
  serviceCallId: number;
  toStatus: string;
  createdAt: string;
};

type Pendency = {
  serviceCallId: number;
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
};

type PolicyData = { policies: SlaPolicy[] };

type AppliedPolicy = {
  actionMinutes: number | null;
  attendanceMinutes: number | null;
  resolutionMinutes: number;
  pausePending: boolean;
};

const fallbackResolutionMinutes: Record<string, number> = {
  critica: 240,
  alta: 480,
  media: 1440,
  baixa: 2880,
};

function toMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function displayNumber(number: string) {
  return number.replace(/^OS-(?:\d{4}-)?/, "TDK-").replace(/^TDK-\d{4}-/, "TDK-");
}

function cardNumber(card: HTMLElement) {
  const text = card.textContent ?? "";
  return text.match(/TDK-[A-Za-z0-9-]+/)?.[0] ?? "";
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

function resolvePolicy(call: ServiceCall, policies: SlaPolicy[]): AppliedPolicy {
  const selected = policies
    .filter((policy) => policyMatches(policy, call))
    .sort((a, b) => policySpecificity(b) - policySpecificity(a) || b.id - a.id)[0];
  if (selected) {
    return {
      actionMinutes: selected.actionMinutes ?? null,
      attendanceMinutes: selected.attendanceMinutes ?? null,
      resolutionMinutes: selected.targetMinutes,
      pausePending: selected.pausePending,
    };
  }
  const priority = normalizePriority(call.priority);
  return {
    actionMinutes: null,
    attendanceMinutes: null,
    resolutionMinutes: fallbackResolutionMinutes[priority] ?? 1440,
    pausePending: true,
  };
}

function transitionAt(callId: number, history: HistoryItem[], status: string) {
  const item = history
    .filter((entry) => entry.serviceCallId === callId && entry.toStatus === status)
    .sort((a, b) => (toMs(a.createdAt) ?? 0) - (toMs(b.createdAt) ?? 0))[0];
  return toMs(item?.createdAt);
}

function pendingUntil(callId: number, pendencies: Pendency[], end: number) {
  return pendencies
    .filter((item) => item.serviceCallId === callId)
    .reduce((total, item) => {
      const start = toMs(item.startedAt);
      if (start === null || start >= end) return total;
      const finish = Math.min(toMs(item.endedAt) ?? end, end);
      return total + Math.max(0, finish - start);
    }, 0);
}

function effectiveElapsed(call: ServiceCall, pendencies: Pendency[], end: number, pausePending: boolean) {
  const start = toMs(call.createdAt) ?? end;
  const raw = Math.max(0, end - start);
  return Math.max(0, raw - (pausePending ? pendingUntil(call.id, pendencies, end) : 0));
}

function durationLabel(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

function monitoredStage(call: ServiceCall, history: HistoryItem[], policy: AppliedPolicy, pendencies: Pendency[]) {
  const now = Date.now();
  const actionAt = transitionAt(call.id, history, "acionado");
  const attendanceAt = transitionAt(call.id, history, "atendimento");

  if (actionAt === null && policy.actionMinutes !== null) {
    return {
      label: "Acionamento",
      elapsed: effectiveElapsed(call, pendencies, now, policy.pausePending),
      target: policy.actionMinutes * 60000,
    };
  }

  if (attendanceAt === null && policy.attendanceMinutes !== null) {
    return {
      label: "Atendimento",
      elapsed: effectiveElapsed(call, pendencies, now, policy.pausePending),
      target: policy.attendanceMinutes * 60000,
    };
  }

  return {
    label: "Resolução",
    elapsed: effectiveElapsed(call, pendencies, now, policy.pausePending),
    target: policy.resolutionMinutes * 60000,
  };
}

export function ServiceCallSlaAlertEnhancer() {
  useEffect(() => {
    let serviceData: ServiceData = { calls: [], history: [], pendencies: [] };
    let policies: SlaPolicy[] = [];
    let frame = 0;

    const findCall = (card: HTMLElement) => {
      const number = cardNumber(card);
      return serviceData.calls.find((call) => displayNumber(call.number) === number);
    };

    const apply = () => {
      frame = 0;
      document.querySelectorAll<HTMLElement>(".service-call-card").forEach((card) => {
        const existing = card.querySelector<HTMLElement>(".service-card-sla-alert");
        const call = findCall(card);
        if (!call || call.status === "concluido" || call.status === "cancelado") {
          existing?.remove();
          return;
        }

        const policy = resolvePolicy(call, policies);
        const stage = monitoredStage(call, serviceData.history, policy, serviceData.pendencies);
        const ratio = stage.elapsed / Math.max(1, stage.target);
        if (ratio < 0.8) {
          existing?.remove();
          return;
        }

        const breached = ratio >= 1;
        const critical = ratio >= 0.95 && !breached;
        const remaining = Math.max(0, stage.target - stage.elapsed);
        const overtime = Math.max(0, stage.elapsed - stage.target);
        const stateClass = breached ? "breached" : critical ? "critical" : "warning";
        const title = breached
          ? `SLA ${stage.label} estourado há ${durationLabel(overtime)}`
          : `${critical ? "SLA crítico" : "SLA em atenção"} · ${durationLabel(remaining)} restantes`;
        const detail = `${Math.min(999, Math.round(ratio * 100))}% do limite consumido`;

        let alert = existing;
        if (!alert) {
          alert = document.createElement("div");
          const footer = card.querySelector<HTMLElement>("footer");
          if (footer) footer.insertAdjacentElement("beforebegin", alert);
          else card.appendChild(alert);
        }
        alert.className = `service-card-sla-alert ${stateClass}`;
        alert.innerHTML = `<strong>${title}</strong><small>${detail}</small>`;
        alert.title = policy.pausePending
          ? "O tempo em pendência é descontado desta política de SLA."
          : "O tempo em pendência continua contando nesta política de SLA.";
      });
    };

    const scheduleApply = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };

    const refresh = async () => {
      try {
        const [serviceResponse, policyResponse] = await Promise.all([
          fetch("/api/service-calls", { cache: "no-store" }),
          fetch("/api/service-call-sla-policies", { cache: "no-store" }),
        ]);
        if (serviceResponse.ok) {
          const payload = (await serviceResponse.json()) as Partial<ServiceData>;
          serviceData = {
            calls: payload.calls ?? [],
            history: payload.history ?? [],
            pendencies: payload.pendencies ?? [],
          };
        }
        if (policyResponse.ok) {
          const payload = (await policyResponse.json()) as Partial<PolicyData>;
          policies = payload.policies ?? [];
        }
        scheduleApply();
      } catch {
        // Alertas são complementares e não podem bloquear o Kanban.
      }
    };

    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });

    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), 60000);
    const countdownTimer = window.setInterval(scheduleApply, 30000);

    return () => {
      observer.disconnect();
      window.clearInterval(refreshTimer);
      window.clearInterval(countdownTimer);
      if (frame) window.cancelAnimationFrame(frame);
      document.querySelectorAll(".service-card-sla-alert").forEach((node) => node.remove());
    };
  }, []);

  return null;
}
