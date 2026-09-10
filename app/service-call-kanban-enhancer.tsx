"use client";

import { useEffect } from "react";

const transitions: Record<string, string[]> = {
  aberto: ["acionado", "cancelado"],
  acionado: ["aberto", "confirmado", "cancelado"],
  confirmado: ["acionado", "deslocamento", "cancelado"],
  deslocamento: ["confirmado", "atendimento", "pendente", "cancelado"],
  atendimento: ["pendente", "concluido", "cancelado"],
  pendente: [
    "acionado",
    "confirmado",
    "deslocamento",
    "atendimento",
    "concluido",
    "cancelado",
  ],
  concluido: [],
  cancelado: [],
};

const statusLabels: Record<string, string> = {
  aberto: "Aberto",
  acionado: "Acionado",
  confirmado: "Confirmado",
  deslocamento: "Deslocamento",
  atendimento: "Em atendimento",
  pendente: "Pendente",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const pendingReasonLabels: Record<string, string> = {
  aguardando_cliente: "Aguardando cliente",
  aguardando_peca_material: "Aguardando peça / material",
  aguardando_acesso: "Aguardando acesso",
  aguardando_aprovacao: "Aguardando aprovação",
  reagendamento: "Reagendamento",
  terceiros: "Aguardando terceiros",
  outros: "Outros",
};

type ServiceCallSummary = {
  id: number;
  number: string;
  status: string;
};

type PendingRecord = {
  id: number;
  serviceCallId: number;
  reason: string;
  notes: string | null;
  startedAt: string;
  endedAt: string | null;
};

type OperationalData = {
  calls: ServiceCallSummary[];
  pendencies: PendingRecord[];
};

function displayServiceCallNumber(number: string) {
  return number.replace(/^OS-(?:\d{4}-)?/, "TDK-").replace(/^TDK-\d{4}-/, "TDK-");
}

function statusFromColumn(column: HTMLElement | null) {
  if (!column) return "";
  const className = Array.from(column.classList).find((name) =>
    name.startsWith("status-"),
  );
  return className?.replace("status-", "") ?? "";
}

function cardNumber(card: HTMLElement) {
  const text = card.textContent ?? "";
  return text.match(/TDK-[A-Za-z0-9-]+/)?.[0] ?? "";
}

function elapsedLabel(startedAt: string) {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "tempo não disponível";
  const minutes = Math.max(0, Math.floor((Date.now() - start) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}min`;
  return `${mins}min`;
}

function ensureFeedback() {
  let feedback = document.querySelector<HTMLElement>(".service-kanban-feedback");
  if (!feedback) {
    feedback = document.createElement("div");
    feedback.className = "service-kanban-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    document.body.appendChild(feedback);
  }
  return feedback;
}

function showFeedback(message: string) {
  const feedback = ensureFeedback();
  feedback.textContent = message;
  feedback.classList.add("visible");
  window.setTimeout(() => feedback?.classList.remove("visible"), 2400);
}

export function ServiceCallKanbanEnhancer() {
  useEffect(() => {
    let operationalData: OperationalData = { calls: [], pendencies: [] };
    let draggedStatus = "";
    let applyFrame = 0;

    const clearDragClasses = () => {
      document
        .querySelectorAll<HTMLElement>(".service-column")
        .forEach((column) =>
          column.classList.remove(
            "service-drop-allowed",
            "service-drop-blocked",
            "service-drop-current",
          ),
        );
    };

    const callForCard = (card: HTMLElement) => {
      const number = cardNumber(card);
      return operationalData.calls.find(
        (call) => displayServiceCallNumber(call.number) === number,
      );
    };

    const openPendencyForCall = (callId: number) =>
      [...operationalData.pendencies]
        .reverse()
        .find((pendency) => pendency.serviceCallId === callId && !pendency.endedAt);

    const applyCardPendency = (card: HTMLElement, call: ServiceCallSummary) => {
      const existing = card.querySelector<HTMLElement>(".service-card-pendency");
      if (call.status !== "pendente") {
        existing?.remove();
        return;
      }
      const pendency = openPendencyForCall(call.id);
      if (!pendency) {
        existing?.remove();
        return;
      }
      const reason = pendingReasonLabels[pendency.reason] ?? pendency.reason;
      const markup = `<span>⏱ Pendente há <strong>${elapsedLabel(pendency.startedAt)}</strong></span><small>${reason}</small>`;
      let info = existing;
      if (!info) {
        info = document.createElement("div");
        info.className = "service-card-pendency";
        const footer = card.querySelector<HTMLElement>("footer");
        if (footer) footer.insertAdjacentElement("beforebegin", info);
        else card.appendChild(info);
      }
      if (info.innerHTML !== markup) info.innerHTML = markup;
      info.title = pendency.notes
        ? `${reason} — ${pendency.notes}`
        : reason;
    };

    const applyColumnSummary = (column: HTMLElement, status: string) => {
      const header = column.querySelector<HTMLElement>(":scope > header");
      if (!header) return;
      let summary = column.querySelector<HTMLElement>(
        ":scope > .service-column-operational-summary",
      );
      if (!summary) {
        summary = document.createElement("div");
        summary.className = "service-column-operational-summary";
        const purpose = column.querySelector<HTMLElement>(
          ":scope > .service-status-purpose",
        );
        (purpose ?? header).insertAdjacentElement("afterend", summary);
      }
      const cards = column.querySelectorAll<HTMLElement>(".service-call-card");
      if (status === "pendente") {
        const open = operationalData.pendencies.filter((item) => !item.endedAt);
        const oldest = open
          .map((item) => item.startedAt)
          .filter(Boolean)
          .sort()[0];
        summary.innerHTML = oldest
          ? `<strong>${cards.length}</strong><span>chamado(s) · mais antigo há ${elapsedLabel(oldest)}</span>`
          : `<strong>${cards.length}</strong><span>chamado(s) pendente(s)</span>`;
        return;
      }
      const allowed = transitions[status] ?? [];
      const next = allowed.filter((target) => target !== "cancelado");
      summary.innerHTML = `<strong>${cards.length}</strong><span>${next.length ? `próximo: ${next.map((target) => statusLabels[target] ?? target).join(" / ")}` : "etapa final"}</span>`;
    };

    const applyStatusSelectRules = () => {
      document
        .querySelectorAll<HTMLSelectElement>(
          ".service-call-sheet .service-call-detail-grid select",
        )
        .forEach((select) => {
          const current = select.value === "triagem" ? "aberto" : select.value;
          const allowed = new Set([current, ...(transitions[current] ?? [])]);
          select.querySelectorAll<HTMLOptionElement>("option").forEach((option) => {
            const visible = allowed.has(option.value);
            option.disabled = !visible;
            option.hidden = !visible;
          });
          select.title = "São exibidas apenas as transições permitidas para a etapa atual.";
        });
    };

    const apply = () => {
      applyFrame = 0;
      document
        .querySelectorAll<HTMLElement>(".service-column")
        .forEach((column) => {
          const status = statusFromColumn(column);
          if (!status || status === "triagem") return;
          applyColumnSummary(column, status);
          column.querySelectorAll<HTMLElement>(".service-call-card").forEach((card) => {
            card.dataset.serviceStatus = status;
            const terminal = status === "concluido" || status === "cancelado";
            card.draggable = !terminal;
            card.classList.toggle("service-card-terminal", terminal);
            const call = callForCard(card);
            if (call) applyCardPendency(card, call);
          });
        });
      applyStatusSelectRules();
    };

    const scheduleApply = () => {
      if (applyFrame) return;
      applyFrame = window.requestAnimationFrame(apply);
    };

    const refresh = async () => {
      try {
        const response = await fetch("/api/service-calls", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as Partial<OperationalData>;
        operationalData = {
          calls: data.calls ?? [],
          pendencies: data.pendencies ?? [],
        };
        scheduleApply();
      } catch {
        // A camada visual não bloqueia a interface principal em caso de falha de rede.
      }
    };

    const handleDragStart = (event: DragEvent) => {
      const source = event.target as HTMLElement | null;
      const card = source?.closest<HTMLElement>(".service-call-card");
      if (!card) return;
      draggedStatus =
        card.dataset.serviceStatus || statusFromColumn(card.closest<HTMLElement>(".service-column"));
      if (!draggedStatus) return;
      const allowed = new Set(transitions[draggedStatus] ?? []);
      document
        .querySelectorAll<HTMLElement>(".service-column")
        .forEach((column) => {
          const target = statusFromColumn(column);
          column.classList.toggle("service-drop-current", target === draggedStatus);
          column.classList.toggle("service-drop-allowed", allowed.has(target));
          column.classList.toggle(
            "service-drop-blocked",
            target !== draggedStatus && !allowed.has(target),
          );
        });
    };

    const handleDrop = (event: DragEvent) => {
      if (!draggedStatus) return;
      const source = event.target as HTMLElement | null;
      const column = source?.closest<HTMLElement>(".service-column");
      const targetStatus = statusFromColumn(column ?? null);
      if (!targetStatus) return;
      const allowed = transitions[draggedStatus] ?? [];
      if (targetStatus !== draggedStatus && !allowed.includes(targetStatus)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        showFeedback(
          `Movimentação não permitida: ${statusLabels[draggedStatus] ?? draggedStatus} → ${statusLabels[targetStatus] ?? targetStatus}.`,
        );
      }
      draggedStatus = "";
      clearDragClasses();
    };

    const handleDragEnd = () => {
      draggedStatus = "";
      clearDragClasses();
    };

    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("dragstart", handleDragStart, true);
    document.addEventListener("drop", handleDrop, true);
    document.addEventListener("dragend", handleDragEnd, true);
    document.addEventListener("change", scheduleApply, true);

    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), 60000);
    const clockTimer = window.setInterval(scheduleApply, 30000);

    return () => {
      observer.disconnect();
      document.removeEventListener("dragstart", handleDragStart, true);
      document.removeEventListener("drop", handleDrop, true);
      document.removeEventListener("dragend", handleDragEnd, true);
      document.removeEventListener("change", scheduleApply, true);
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
      if (applyFrame) window.cancelAnimationFrame(applyFrame);
      document.querySelector(".service-kanban-feedback")?.remove();
    };
  }, []);

  return null;
}
