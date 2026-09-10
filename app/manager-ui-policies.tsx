"use client";

import { useEffect } from "react";

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
  const codeLabel = Array.from(dialog.querySelectorAll<HTMLLabelElement>("label")).find(
    (label) => label.textContent?.trim() === "Código",
  );
  const input = codeLabel?.parentElement?.querySelector<HTMLInputElement>("input");
  if (!input) return;
  input.disabled = true;
  input.placeholder = placeholder;
  input.title = "Código gerado automaticamente pelo TDK Manager.";
  input.setAttribute("aria-readonly", "true");
}

export function ManagerUiPolicies() {
  useEffect(() => {
    const applyPolicies = () => {
      document
        .querySelectorAll<HTMLElement>(".service-column.status-triagem")
        .forEach((column) => {
          column.style.display = "none";
        });

      document
        .querySelectorAll<HTMLOptionElement>('option[value="triagem"]')
        .forEach((option) => {
          option.hidden = true;
          option.disabled = true;
        });

      document.querySelectorAll<HTMLElement>(".catalog-dialog").forEach((dialog) => {
        const kicker = dialog.querySelector<HTMLElement>(".dialog-kicker")?.textContent?.trim();
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

      document.querySelectorAll<HTMLElement>(".service-call-dialog").forEach((dialog) => {
        const title = Array.from(dialog.querySelectorAll<HTMLElement>("*")).find(
          (element) =>
            element.children.length === 0 &&
            element.textContent?.trim() === "Novo chamado",
        );
        if (title) {
          const number = dialog.querySelector<HTMLElement>(
            ".service-call-header-number",
          );
          if (number) number.textContent = "Número gerado automaticamente ao salvar";
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

        const rule = dialog.querySelector<HTMLElement>(".service-call-rule-note");
        if (rule)
          rule.textContent =
            "Chamados novos começam em Aberto. Complete tomador, local, contato, chamado interno, modalidade e agendamento antes de avançar o atendimento. O departamento é opcional.";
      });

      replaceExactText(
        document,
        "Faça a triagem, distribua e acompanhe os atendimentos técnicos.",
        "Receba, distribua e acompanhe os atendimentos técnicos desde a abertura.",
      );

      document
        .querySelectorAll<HTMLElement>(".service-call-sheet strong, .service-call-card b")
        .forEach((element) => {
          if (element.textContent?.includes("Triagem"))
            element.textContent = element.textContent.replaceAll("Triagem", "Aberto");
        });
    };

    applyPolicies();
    const observer = new MutationObserver(applyPolicies);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
