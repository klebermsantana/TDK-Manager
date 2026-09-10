"use client";

import { useEffect } from "react";

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
      "Atendimento aguardando cliente, peça, acesso ou outra condição. Retome na etapa operacional adequada.",
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

export function ManagerUiPolicies() {
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
            "Chamados novos começam em Aberto. Para Acionar, complete tomador, local, contato, chamado interno e modalidade, além de definir o técnico. O agendamento passa a ser obrigatório ao Confirmar o atendimento. O departamento é opcional.";
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
    };

    const schedulePolicies = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(applyPolicies);
    };

    applyPolicies();
    const observer = new MutationObserver(schedulePolicies);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.addEventListener("change", schedulePolicies, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedulePolicies, true);
    };
  }, []);

  return null;
}
