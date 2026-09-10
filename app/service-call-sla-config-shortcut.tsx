"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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

function findConfigureButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) =>
    /configurar regras/i.test(item.textContent ?? ""),
  );
}

function findSlaTrigger() {
  return document.querySelector<HTMLButtonElement>(".service-sla-trigger");
}

export function ServiceCallSlaConfigShortcut() {
  const [visible, setVisible] = useState(false);
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

  function openRules() {
    const configureNow = findConfigureButton();
    if (configureNow) {
      configureNow.click();
      return;
    }

    findSlaTrigger()?.click();

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const configure = findConfigureButton();
      if (configure) {
        window.clearInterval(timer);
        configure.click();
        return;
      }
      if (attempts >= 20) window.clearInterval(timer);
    }, 50);
  }

  if (!visible || !headerTarget) return null;

  return createPortal(
    <button
      className="service-sla-config-shortcut"
      type="button"
      onClick={openRules}
      title="Cadastrar e editar políticas de SLA"
    >
      <span aria-hidden="true">⚙</span>
      <strong>Configurar regras</strong>
    </button>,
    headerTarget,
  );
}
