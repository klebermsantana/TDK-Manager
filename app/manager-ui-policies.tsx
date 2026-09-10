"use client";

import { useEffect, useState } from "react";

const serviceFlow: Record<
  string,
  { label: string; purpose: string; allowed: string[] }
> = {
  aberto: {
    label: "Aberto",
    purpose:
      "Entrada do chamado. Complete os dados necessários e defina o técnico responsável antes de acionar.",
    allowed: ["acionado"],
  },
  acionado: {
    label: "Acionado",
    purpose:
      "Técnico já definido. Alinhe data e horário com o cliente para confirmar o atendimento.",
    allowed: ["aberto", "confirmado"],
  },
  confirmado: {
    label: "Confirmado",
    purpose:
      "Atendimento confirmado com data e horário. O próximo passo operacional é iniciar o deslocamento.",
    allowed: ["acionado", "deslocamento"],
  },
  deslocamento: {
    label: "Deslocamento",
    purpose:
      "Técnico a caminho do local. Ao chegar, inicie o atendimento ou marque como pendente se houver impedimento.",
    allowed: ["confirmado", "atendimento", "pendente"],
  },
  atendimento: {
    label: "Em atendimento",
    purpose:
      "Execução técnica em andamento. Registre serviços, materiais, equipamentos, despesas e evidências.",
    allowed: ["pendente", "concluido"],
  },
  pendente: {
    label: "Pendente",
    purpose:
      "Atendimento aguardando cliente, peça, acesso ou outra condição. O motivo e o início da pendência ficam registrados para controle de SLA.",
    allowed: [
      "acionado",
      "confirmado",
      "deslocamento",
      "atendimento",
      "concluido",
    ],
  },
  concluido: {
    label: "Concluído",
    purpose:
      "Atendimento finalizado. A conclusão exige ao menos um serviço executado e uma foto de evidência.",
    allowed: [],
  },
  cancelado: {
    label: "Cancelado",
    purpose:
      "Chamado encerrado sem continuidade operacional. O histórico permanece disponível para consulta.",
    allowed: [],
  },
};

const actionLabels: Record<string, string> = {
  aberto: "Voltar para Aberto",
  acionado: "Acionar técnico",
  confirmado: "Confirmar atendimento",
  deslocamento: "Iniciar deslocamento",
  atendimento: "Iniciar atendimento",
  pendente: "Marcar como Pendente",
  concluido: "Concluir atendimento",
};

const pendingReasonOptions = [
  { value: "aguardando_cliente", label: "Aguardando cliente" },
  { value: "aguardando_peca_material", label: "Aguardando peça / material" },
  { value: "aguardando_acesso", label: "Aguardando acesso" },
  { value: "aguardando_aprovacao", label: "Aguardando aprovação" },
  { value: "reagendamento", label: "Reagendamento" },
  { value: "terceiros", label: "Aguardando terceiros" },
  { value: "outros", label: "Outros" },
] as const;

const pendingReasonLabels = Object.fromEntries(
  pendingReasonOptions.map((item) => [item.value, item.label]),
) as Record<string, string>;

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
  startedBy: string;
  endedBy: string | null;
};

type PendingDialogState = {
  callNumber: string;
  editing: boolean;
} | null;

function displayServiceCallNumber(number: string) {
  return number.replace(/^OS-(?:\d{4}-)?/, "TDK-").replace(/^TDK-\d{4}-/, "TDK-");
}

function sheetServiceCallNumber(sheet: HTMLElement) {
  const title =
    sheet.querySelector<HTMLElement>("[data-slot='sheet-title']") ??
    sheet.querySelector<HTMLElement>("h2");
  const text = title?.textContent?.trim() ?? "";
  const match = text.match(/TDK-[A-Za-z0-9-]+/);
  return match?.[0] ?? text;
}

function formatPendingDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function replaceExactText(root: ParentNode, from: string, to: string) {
  root.querySelectorAll<HTMLElement>("*").forEach((element) => {
    if (element.children.length === 0 && element.textContent?.trim() === from)
      element.textContent = to;
  });
}

function disableAutomaticCodeField(
  dialog: HTMLElement,
  placeholder: string,
) {
  const codeLabel = Array.from(
    dialog.querySelectorAll<HTMLLabelElement>("label"),
  ).find((label) => label.textContent?.trim() === "Código");
  const input = codeLabel?.parentElement?.querySelector<HTMLInputElement>("input");
  if (!input) return;
  input.disabled = true;
  input.placeholder = placeholder;
  input.title = "Código gerado automaticamente pelo TDK Manager.";
  input.setAttribute("aria-readonly", "true");
}

function applyServiceColumnPurposes() {
  document
    .querySelectorAll<HTMLElement>(".service-column")
    .forEach((column) => {
      const statusClass = Array.from(column.classList).find((name) =>
        name.startsWith("status-"),
      );
      const status = statusClass?.replace("status-", "");
      if (!status) return;
      if (status === "triagem") {
        column.style.display = "none";
        return;
      }
      const flow = serviceFlow[status];
      const header = column.querySelector<HTMLElement>(":scope > header");
      if (!flow || !header) return;
      let purpose = column.querySelector<HTMLElement>(
        ":scope > .service-status-purpose",
      );
      if (!purpose) {
        purpose = document.createElement("p");
        purpose.className = "service-status-purpose";
        header.insertAdjacentElement("afterend", purpose);
      }
      if (purpose.textContent !== flow.purpose) purpose.textContent = flow.purpose;
    });
}

function applyServiceSheetFlow() {
  document
    .querySelectorAll<HTMLElement>(".service-call-sheet")
    .forEach((sheet) => {
      const statusSelect = sheet.querySelector<HTMLSelectElement>(
        ".service-call-detail-grid select",
      );
      const status =
        statusSelect?.value === "triagem" ? "aberto" : statusSelect?.value;
      const flow = status ? serviceFlow[status] : undefined;
      if (!flow) return;

      let guidance = sheet.querySelector<HTMLElement>(
        ".service-stage-guidance",
      );
      const quick = sheet.querySelector<HTMLElement>(
        ".service-call-quick-actions",
      );
      if (!guidance) {
        guidance = document.createElement("section");
        guidance.className = "service-stage-guidance";
        if (quick) quick.insertAdjacentElement("beforebegin", guidance);
      }
      if (guidance) {
        const markup = `<strong>${flow.label}</strong><span>${flow.purpose}</span>`;
        if (guidance.innerHTML !== markup) guidance.innerHTML = markup;
      }

      if (!quick) return;
      const heading = quick.querySelector<HTMLElement>("h3");
      if (heading && heading.textContent !== "Ações do fluxo")
        heading.textContent = "Ações do fluxo";

      const allowed = new Set(flow.allowed);
      let visibleActions = 0;
      quick.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        let target = button.dataset.flowTarget;
        if (!target) {
          const original = button.textContent?.trim() ?? "";
          target = Object.entries(serviceFlow).find(
            ([, item]) => item.label === original,
          )?.[0];
          if (target) button.dataset.flowTarget = target;
        }
        if (!target) return;
        const visible = allowed.has(target);
        button.style.display = visible ? "" : "none";
        if (visible) {
          visibleActions += 1;
          const label = actionLabels[target] ?? serviceFlow[target]?.label ?? target;
          if (button.textContent !== label) button.textContent = label;
          button.setAttribute("aria-label", label);
        }
      });
      quick.style.display = visibleActions ? "" : "none";
    });
}

function applyPendingDetails(
  calls: ServiceCallSummary[],
  pendencies: PendingRecord[],
) {
  document
    .querySelectorAll<HTMLElement>(".service-call-sheet")
    .forEach((sheet) => {
      const existing = sheet.querySelector<HTMLElement>(".service-pending-info");
      const statusSelect = sheet.querySelector<HTMLSelectElement>(
        ".service-call-detail-grid select",
      );
      if (statusSelect?.value !== "pendente") {
        existing?.remove();
        return;
      }
      const visibleNumber = sheetServiceCallNumber(sheet);
      const call = calls.find(
        (item) => displayServiceCallNumber(item.number) === visibleNumber,
      );
      if (!call) return;
      const pendency = [...pendencies]
        .reverse()
        .find((item) => item.serviceCallId === call.id && !item.endedAt);
      if (!pendency) return;

      const notes = pendency.notes
        ? `<p>${pendency.notes.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`
        : "";
      const markup = `<div><span>Motivo da pendência</span><strong>${pendingReasonLabels[pendency.reason] ?? pendency.reason}</strong></div><div><span>Desde</span><strong>${formatPendingDate(pendency.startedAt)}</strong></div>${notes}<button type="button" data-pending-edit="${call.id}">Editar pendência</button>`;
      let info = existing;
      if (!info) {
        info = document.createElement("section");
        info.className = "service-pending-info";
        const guidance = sheet.querySelector<HTMLElement>(".service-stage-guidance");
        if (guidance) guidance.insertAdjacentElement("afterend", info);
      }
      if (info && info.innerHTML !== markup) info.innerHTML = markup;
    });
}

export function ManagerUiPolicies() {
  const [calls, setCalls] = useState<ServiceCallSummary[]>([]);
  const [pendencies, setPendencies] = useState<PendingRecord[]>([]);
  const [pendingDialog, setPendingDialog] = useState<PendingDialogState>(null);
  const [pendingReason, setPendingReason] = useState("");
  const [pendingNotes, setPendingNotes] = useState("");
  const [pendingError, setPendingError] = useState("");
  const [pendingSaving, setPendingSaving] = useState(false);

  async function refreshPendingData() {
    try {
      const response = await fetch("/api/service-calls", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as {
        calls?: ServiceCallSummary[];
        pendencies?: PendingRecord[];
      };
      setCalls(data.calls ?? []);
      setPendencies(data.pendencies ?? []);
    } catch {
      // A interface principal continua funcional mesmo se este complemento falhar.
    }
  }

  useEffect(() => {
    void refreshPendingData();
  }, []);

  useEffect(() => {
    let scheduled = false;
    const applyPolicies = () => {
      scheduled = false;

      document
        .querySelectorAll<HTMLOptionElement>('option[value="triagem"]')
        .forEach((option) => {
          option.hidden = true;
          option.disabled = true;
        });

      document
        .querySelectorAll<HTMLElement>(".catalog-dialog")
        .forEach((dialog) => {
          const kicker = dialog
            .querySelector<HTMLElement>(".dialog-kicker")
            ?.textContent?.trim();
          if (kicker === "CATÁLOGO COMERCIAL")
            disableAutomaticCodeField(
              dialog,
              "Gerado automaticamente · PS-0001, PS-0002...",
            );
          if (kicker === "EQUIPAMENTOS E PEÇAS")
            disableAutomaticCodeField(
              dialog,
              "Gerado automaticamente · EQ-0001, EQ-0002...",
            );
        });

      document
        .querySelectorAll<HTMLElement>(".service-call-dialog")
        .forEach((dialog) => {
          const title = Array.from(
            dialog.querySelectorAll<HTMLElement>("*"),
          ).find(
            (element) =>
              element.children.length === 0 &&
              element.textContent?.trim() === "Novo chamado",
          );
          if (title) {
            const number = dialog.querySelector<HTMLElement>(
              ".service-call-header-number",
            );
            if (
              number &&
              number.textContent !== "Número gerado automaticamente ao salvar"
            )
              number.textContent = "Número gerado automaticamente ao salvar";
          }

          replaceExactText(
            dialog,
            "Registre inicialmente a ocorrência para triagem.",
            "Registre a ocorrência. O chamado será criado diretamente como Aberto, mesmo com informações operacionais pendentes.",
          );
          replaceExactText(
            dialog,
            "Cadastrar em triagem",
            "Cadastrar chamado",
          );

          const rule = dialog.querySelector<HTMLElement>(
            ".service-call-rule-note",
          );
          const ruleText =
            "Chamados novos começam em Aberto. Para Acionar, complete tomador, local, contato, chamado interno e modalidade, além de definir o técnico. O agendamento passa a ser obrigatório ao Confirmar o atendimento. Ao marcar Pendente, o motivo será obrigatório e o tempo parado começará a ser registrado. O departamento é opcional.";
          if (rule && rule.textContent !== ruleText) rule.textContent = ruleText;
        });

      replaceExactText(
        document,
        "Faça a triagem, distribua e acompanhe os atendimentos técnicos.",
        "Receba, distribua e acompanhe os atendimentos técnicos desde a abertura.",
      );

      document
        .querySelectorAll<HTMLElement>(
          ".service-call-sheet strong, .service-call-card b",
        )
        .forEach((element) => {
          const text = element.textContent;
          if (text?.includes("Triagem"))
            element.textContent = text.replaceAll("Triagem", "Aberto");
        });

      applyServiceColumnPurposes();
      applyServiceSheetFlow();
      applyPendingDetails(calls, pendencies);
    };

    const schedulePolicies = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(applyPolicies);
    };

    const handleClick = (event: MouseEvent) => {
      const source = event.target as HTMLElement | null;
      const pendingButton = source?.closest<HTMLButtonElement>(
        'button[data-flow-target="pendente"]',
      );
      if (pendingButton) {
        const sheet = pendingButton.closest<HTMLElement>(".service-call-sheet");
        const callNumber = sheet ? sheetServiceCallNumber(sheet) : "";
        if (!callNumber) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setPendingReason("");
        setPendingNotes("");
        setPendingError("");
        setPendingDialog({ callNumber, editing: false });
        return;
      }

      const editButton = source?.closest<HTMLButtonElement>(
        "button[data-pending-edit]",
      );
      if (!editButton) return;
      const serviceCallId = Number(editButton.dataset.pendingEdit);
      const call = calls.find((item) => item.id === serviceCallId);
      const pendency = [...pendencies]
        .reverse()
        .find((item) => item.serviceCallId === serviceCallId && !item.endedAt);
      if (!call || !pendency) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingReason(pendency.reason);
      setPendingNotes(pendency.notes ?? "");
      setPendingError("");
      setPendingDialog({
        callNumber: displayServiceCallNumber(call.number),
        editing: true,
      });
    };

    applyPolicies();
    const observer = new MutationObserver(schedulePolicies);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.addEventListener("change", schedulePolicies, true);
    document.addEventListener("click", handleClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedulePolicies, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [calls, pendencies]);

  async function savePendency() {
    if (!pendingDialog || pendingSaving) return;
    if (!pendingReason) {
      setPendingError("Selecione o motivo da pendência.");
      return;
    }
    if (pendingReason === "outros" && !pendingNotes.trim()) {
      setPendingError("Descreva a pendência quando selecionar Outros.");
      return;
    }

    setPendingSaving(true);
    setPendingError("");
    try {
      const response = await fetch("/api/service-calls", { cache: "no-store" });
      const data = (await response.json()) as {
        calls?: ServiceCallSummary[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível localizar o chamado.");
      const call = (data.calls ?? []).find(
        (item) => displayServiceCallNumber(item.number) === pendingDialog.callNumber,
      );
      if (!call) throw new Error("Chamado não encontrado para registrar a pendência.");

      const update = await fetch("/api/service-calls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: call.id,
          status: "pendente",
          pendingReason,
          pendingNotes: pendingNotes.trim(),
        }),
      });
      const result = (await update.json()) as { error?: string };
      if (!update.ok)
        throw new Error(result.error ?? "Não foi possível registrar a pendência.");

      setPendingDialog(null);
      await refreshPendingData();
      window.location.reload();
    } catch (reason) {
      setPendingError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível registrar a pendência.",
      );
    } finally {
      setPendingSaving(false);
    }
  }

  return pendingDialog ? (
    <div className="pending-dialog-backdrop" role="presentation">
      <section
        className="pending-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-dialog-title"
      >
        <header>
          <div>
            <span>PENDÊNCIA OPERACIONAL</span>
            <h2 id="pending-dialog-title">
              {pendingDialog.editing ? "Editar pendência" : "Marcar como Pendente"}
            </h2>
            <p>{pendingDialog.callNumber}</p>
          </div>
          <button
            type="button"
            className="pending-dialog-close"
            aria-label="Fechar"
            onClick={() => setPendingDialog(null)}
          >
            ×
          </button>
        </header>

        <label className="pending-dialog-field">
          <span>Motivo da pendência *</span>
          <select
            value={pendingReason}
            onChange={(event) => setPendingReason(event.target.value)}
          >
            <option value="">Selecione...</option>
            {pendingReasonOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="pending-dialog-field">
          <span>Observação</span>
          <textarea
            value={pendingNotes}
            onChange={(event) => setPendingNotes(event.target.value)}
            rows={4}
            placeholder="Detalhe o impedimento, previsão, responsável ou informação útil para a retomada."
          />
        </label>

        <p className="pending-dialog-hint">
          Ao registrar, o TDK Manager grava automaticamente a data e hora de início. Ao retomar o atendimento, o período de pendência será encerrado e permanecerá no histórico para cálculo de SLA.
        </p>

        {pendingError && <p className="pending-dialog-error">{pendingError}</p>}

        <footer>
          <button
            type="button"
            className="pending-dialog-secondary"
            onClick={() => setPendingDialog(null)}
            disabled={pendingSaving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="pending-dialog-primary"
            onClick={() => void savePendency()}
            disabled={pendingSaving}
          >
            {pendingSaving
              ? "Salvando..."
              : pendingDialog.editing
                ? "Salvar alterações"
                : "Registrar pendência"}
          </button>
        </footer>
      </section>
    </div>
  ) : null;
}
