"use client";

import { useEffect } from "react";

function switchToOperations() {
  document
    .querySelector<HTMLButtonElement>(".service-sla-dashboard .service-sla-close")
    ?.click();
  window.setTimeout(() => {
    document.querySelector<HTMLButtonElement>(".service-ops-trigger")?.click();
  }, 80);
}

function switchToSla() {
  document
    .querySelector<HTMLButtonElement>(".service-ops-dashboard .service-ops-close")
    ?.click();
  window.setTimeout(() => {
    document.querySelector<HTMLButtonElement>(".service-sla-trigger")?.click();
  }, 80);
}

function ensureSwitchButton(
  target: HTMLElement | null,
  className: string,
  label: string,
  title: string,
  handler: () => void,
) {
  if (!target || target.querySelector(`.${className}`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `service-manager-switch ${className}`;
  button.textContent = label;
  button.title = title;
  button.addEventListener("click", handler);
  target.insertBefore(button, target.firstChild);
}

function applyNavigation() {
  ensureSwitchButton(
    document.querySelector<HTMLElement>(
      ".service-sla-dashboard .service-sla-header-actions",
    ),
    "service-manager-switch-operations",
    "Visão operacional",
    "Abrir backlog, produtividade, fluxo de aberturas e conclusões e fila gerencial",
    switchToOperations,
  );

  ensureSwitchButton(
    document.querySelector<HTMLElement>(
      ".service-ops-dashboard .service-ops-header-actions",
    ),
    "service-manager-switch-sla",
    "Visão SLA",
    "Abrir indicadores, alertas e políticas de SLA",
    switchToSla,
  );
}

export function ServiceCallManagementHub() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyNavigation();
      });
    };

    applyNavigation();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
