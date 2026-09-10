"use client";

import { useEffect, useState } from "react";

const reasons = [
  ["aguardando_cliente", "Aguardando cliente"],
  ["aguardando_peca_material", "Aguardando peça / material"],
  ["aguardando_acesso", "Aguardando acesso"],
  ["aguardando_aprovacao", "Aguardando aprovação"],
  ["reagendamento", "Reagendamento"],
  ["terceiros", "Aguardando terceiros"],
  ["outros", "Outros"],
] as const;

type PendingRequest = {
  callId: number;
  callNumber: string;
};

export function ServiceCallPendingBridge() {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handlePendingRequest = (event: Event) => {
      const detail = (event as CustomEvent<PendingRequest>).detail;
      if (!detail?.callId) return;
      setRequest(detail);
      setReason("");
      setNotes("");
      setError("");
    };

    window.addEventListener("tdk:service-call-pending", handlePendingRequest);
    return () =>
      window.removeEventListener(
        "tdk:service-call-pending",
        handlePendingRequest,
      );
  }, []);

  async function save() {
    if (!request || saving) return;
    if (!reason) {
      setError("Selecione o motivo da pendência.");
      return;
    }
    if (reason === "outros" && !notes.trim()) {
      setError("Descreva a pendência quando selecionar Outros.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/service-calls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: request.callId,
          status: "pendente",
          pendingReason: reason,
          pendingNotes: notes.trim(),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "Não foi possível registrar a pendência.");

      setRequest(null);
      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível registrar a pendência.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!request) return null;

  return (
    <div className="pending-dialog-backdrop" role="presentation">
      <section
        className="pending-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-pending-title"
      >
        <header>
          <div>
            <span>PENDÊNCIA OPERACIONAL</span>
            <h2 id="service-pending-title">Marcar como Pendente</h2>
            <p>{request.callNumber}</p>
          </div>
          <button
            type="button"
            className="pending-dialog-close"
            aria-label="Fechar"
            disabled={saving}
            onClick={() => setRequest(null)}
          >
            ×
          </button>
        </header>

        <label className="pending-dialog-field">
          <span>Motivo da pendência *</span>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
          >
            <option value="">Selecione...</option>
            {reasons.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="pending-dialog-field">
          <span>Observação</span>
          <textarea
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Informe o impedimento, previsão, responsável ou outra informação útil para a retomada."
          />
        </label>

        <p className="pending-dialog-hint">
          A data e a hora de início da pendência serão registradas automaticamente.
          Ao retomar o chamado, o período ficará encerrado no histórico para uso em SLA e relatórios.
        </p>

        {error && <p className="pending-dialog-error">{error}</p>}

        <footer>
          <button
            type="button"
            className="pending-dialog-secondary"
            disabled={saving}
            onClick={() => setRequest(null)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="pending-dialog-primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Salvando..." : "Registrar pendência"}
          </button>
        </footer>
      </section>
    </div>
  );
}
