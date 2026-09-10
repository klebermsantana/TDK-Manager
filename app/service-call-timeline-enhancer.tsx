"use client";

import { useEffect, useState } from "react";

type ServiceCallSummary = {
  id: number;
  number: string;
  status: string;
  createdAt: string;
  createdBy: string;
};

type ServiceCallHistory = {
  id: number;
  serviceCallId: number;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string;
  createdAt: string;
};

type ServiceCallPendency = {
  id: number;
  serviceCallId: number;
  reason: string;
  notes: string | null;
  startedAt: string;
  endedAt: string | null;
  startedBy: string;
  endedBy: string | null;
};

type ServiceCallData = {
  calls: ServiceCallSummary[];
  history: ServiceCallHistory[];
  pendencies: ServiceCallPendency[];
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

const terminalStatuses = new Set(["concluido", "cancelado"]);

function displayServiceCallNumber(number: string) {
  return number
    .replace(/^OS-(?:\d{4}-)?/, "TDK-")
    .replace(/^TDK-\d{4}-/, "TDK-");
}

function sheetServiceCallNumber(sheet: HTMLElement) {
  const title =
    sheet.querySelector<HTMLElement>("[data-slot='sheet-title']") ??
    sheet.querySelector<HTMLElement>("h2");
  const text = title?.textContent?.trim() ?? "";
  return text.match(/TDK-[A-Za-z0-9-]+/)?.[0] ?? text;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  if (totalMinutes < 1) return "< 1 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24)
    return minutes ? `${totalHours}h ${minutes}min` : `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

function sumPendencyTime(
  pendencies: ServiceCallPendency[],
  serviceCallId: number,
  now: number,
) {
  return pendencies
    .filter((item) => item.serviceCallId === serviceCallId)
    .reduce((total, item) => {
      const start = toTime(item.startedAt);
      const end = toTime(item.endedAt) ?? now;
      return start === null ? total : total + Math.max(0, end - start);
    }, 0);
}

function timelineMarkup(
  call: ServiceCallSummary,
  history: ServiceCallHistory[],
  pendencies: ServiceCallPendency[],
  now: number,
) {
  const events = history
    .filter((item) => item.serviceCallId === call.id)
    .slice()
    .sort((a, b) => (toTime(a.createdAt) ?? 0) - (toTime(b.createdAt) ?? 0));
  const createdAt = toTime(call.createdAt) ?? now;
  const firstEventAt = events.length ? toTime(events[0].createdAt) : null;

  if (
    !events.length ||
    events[0].toStatus !== "aberto" ||
    (firstEventAt !== null && firstEventAt - createdAt > 60000)
  ) {
    events.unshift({
      id: -call.id,
      serviceCallId: call.id,
      fromStatus: null,
      toStatus: "aberto",
      changedBy: call.createdBy,
      createdAt: call.createdAt,
    });
  }

  const lastEvent = events[events.length - 1];
  const lastEventAt = lastEvent ? toTime(lastEvent.createdAt) : null;
  const operationalEnd =
    terminalStatuses.has(call.status) && lastEventAt !== null ? lastEventAt : now;
  const elapsed = Math.max(0, operationalEnd - createdAt);
  const pendingTotal = sumPendencyTime(pendencies, call.id, operationalEnd);
  const activeTime = Math.max(0, elapsed - pendingTotal);
  const activePendency = [...pendencies]
    .reverse()
    .find((item) => item.serviceCallId === call.id && !item.endedAt);

  const rows = events
    .map((event, index) => {
      const start = toTime(event.createdAt) ?? createdAt;
      const next = events[index + 1];
      const nextTime = next ? toTime(next.createdAt) : null;
      const isLast = index === events.length - 1;
      const isTerminal = isLast && terminalStatuses.has(event.toStatus);
      const end = nextTime ?? (isTerminal ? start : operationalEnd);
      const duration = isTerminal ? "Status final" : formatDuration(end - start);
      const current = isLast && !terminalStatuses.has(call.status);
      const pendency =
        event.toStatus === "pendente"
          ? pendencies.find(
              (item) =>
                item.serviceCallId === call.id &&
                Math.abs((toTime(item.startedAt) ?? 0) - start) < 120000,
            )
          : undefined;
      const pendingDetail = pendency
        ? `<div class="service-timeline-pending-detail"><strong>${escapeHtml(
            pendingReasonLabels[pendency.reason] ?? pendency.reason,
          )}</strong>${
            pendency.notes
              ? `<span>${escapeHtml(pendency.notes)}</span>`
              : ""
          }</div>`
        : "";

      return `<article class="service-timeline-event status-${escapeHtml(
        event.toStatus,
      )}${current ? " current" : ""}">
        <div class="service-timeline-marker"><i></i></div>
        <div class="service-timeline-event-body">
          <header>
            <div>
              <span class="service-timeline-stage">${escapeHtml(
                statusLabels[event.toStatus] ?? event.toStatus,
              )}</span>
              ${current ? '<em>Etapa atual</em>' : ""}
            </div>
            <strong>${escapeHtml(duration)}</strong>
          </header>
          <div class="service-timeline-meta">
            <span><b>Início</b>${escapeHtml(formatDateTime(event.createdAt))}</span>
            <span><b>Responsável</b>${escapeHtml(event.changedBy || call.createdBy)}</span>
            ${
              next
                ? `<span><b>Fim</b>${escapeHtml(formatDateTime(next.createdAt))}</span>`
                : isTerminal
                  ? `<span><b>Encerramento</b>${escapeHtml(formatDateTime(event.createdAt))}</span>`
                  : '<span><b>Fim</b>Em andamento</span>'
            }
          </div>
          ${pendingDetail}
        </div>
      </article>`;
    })
    .join("");

  const pendingBadge = activePendency
    ? `<span class="service-timeline-open-pending">Pendência atual · ${escapeHtml(
        pendingReasonLabels[activePendency.reason] ?? activePendency.reason,
      )}</span>`
    : "";

  return `<section class="service-timeline-panel" aria-label="Linha do tempo operacional">
    <header class="service-timeline-head">
      <div>
        <small>LINHA DO TEMPO OPERACIONAL</small>
        <h3>Jornada do atendimento</h3>
        <p>Histórico cronológico das etapas da OS, com responsáveis e tempo consumido.</p>
      </div>
      ${pendingBadge}
    </header>
    <div class="service-timeline-kpis">
      <div><span>Tempo total</span><strong>${escapeHtml(formatDuration(elapsed))}</strong></div>
      <div><span>Tempo ativo</span><strong>${escapeHtml(formatDuration(activeTime))}</strong></div>
      <div class="pending"><span>Em pendência</span><strong>${escapeHtml(
        formatDuration(pendingTotal),
      )}</strong></div>
      <div><span>Etapas registradas</span><strong>${events.length}</strong></div>
    </div>
    <div class="service-timeline-events">${rows}</div>
  </section>`;
}

export function ServiceCallTimelineEnhancer() {
  const [data, setData] = useState<ServiceCallData>({
    calls: [],
    history: [],
    pendencies: [],
  });

  useEffect(() => {
    let active = true;
    let refreshTimeout = 0;

    async function refresh() {
      try {
        const response = await fetch("/api/service-calls", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as Partial<ServiceCallData>;
        if (!active) return;
        setData({
          calls: payload.calls ?? [],
          history: payload.history ?? [],
          pendencies: payload.pendencies ?? [],
        });
      } catch {
        // A OS continua utilizável mesmo se o complemento de timeline falhar.
      }
    }

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimeout);
      refreshTimeout = window.setTimeout(() => void refresh(), 180);
    };
    const observer = new MutationObserver((mutations) => {
      if (
        mutations.some((mutation) =>
          Array.from(mutation.addedNodes).some(
            (node) =>
              node instanceof HTMLElement &&
              (node.matches?.(".service-call-sheet") ||
                Boolean(node.querySelector?.(".service-call-sheet"))),
          ),
        )
      )
        scheduleRefresh();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("tdk:service-call-timeline-refresh", scheduleRefresh);
    void refresh();
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener(
        "tdk:service-call-timeline-refresh",
        scheduleRefresh,
      );
      window.clearTimeout(refreshTimeout);
    };
  }, []);

  useEffect(() => {
    const render = () => {
      const now = Date.now();
      document
        .querySelectorAll<HTMLElement>(".service-call-sheet")
        .forEach((sheet) => {
          const number = sheetServiceCallNumber(sheet);
          const call = data.calls.find(
            (item) => displayServiceCallNumber(item.number) === number,
          );
          const existing = sheet.querySelector<HTMLElement>(
            ".service-timeline-panel",
          );
          if (!call) {
            existing?.remove();
            return;
          }

          const markup = timelineMarkup(call, data.history, data.pendencies, now);
          if (existing) {
            existing.outerHTML = markup;
            return;
          }
          const historySection = sheet.querySelector<HTMLElement>(
            ".opportunity-history",
          );
          historySection?.insertAdjacentHTML("beforebegin", markup);
        });
    };

    render();
    const timer = window.setInterval(render, 60000);
    return () => window.clearInterval(timer);
  }, [data]);

  return null;
}
