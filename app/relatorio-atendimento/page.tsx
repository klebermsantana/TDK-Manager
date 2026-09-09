"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

type Call = {
  id: number;
  number: string;
  companyName: string;
  serviceTaker: string | null;
  location: string | null;
  contactName: string | null;
  department: string | null;
  customerTicket: string | null;
  technician: string | null;
  serviceType: string;
  scheduledAt: string | null;
  status: string;
  subject: string;
  description: string;
  executedService: string | null;
  createdAt: string;
};
type Entry = {
  id: number;
  description: string;
  quantity?: number;
  unit?: string;
  technician?: string | null;
  notes?: string | null;
  unitCost?: number;
  brandModel?: string | null;
  removedSerial?: string | null;
  installedSerial?: string | null;
  reason?: string | null;
  category?: string;
  amount?: number;
  expenseDate?: string;
};
type Photo = {
  id: number;
  serviceCallId: number;
  name: string;
  uploadedBy: string;
  createdAt: string;
};

const statusLabels: Record<string, string> = {
  triagem: "Triagem",
  aberto: "Aberto",
  acionado: "Acionado",
  confirmado: "Confirmado",
  deslocamento: "Deslocamento",
  atendimento: "Em atendimento",
  pendente: "Pendente",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
const displayNumber = (number: string) => number.replace(/^OS-/, "TDK-");
const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "Não informado";
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );

export default function ServiceCallReportPage() {
  const [data, setData] = useState<{
    call: Call;
    services: Entry[];
    materials: Entry[];
    equipment: Entry[];
    expenses: Entry[];
    photos: Photo[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("id"));
    if (!id) {
      queueMicrotask(() => setError("Atendimento não informado."));
      return;
    }
    Promise.all([
      fetch("/api/service-calls").then(async (r) => {
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        return p;
      }),
      fetch(`/api/service-call-entries?serviceCallId=${id}`).then(async (r) => {
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        return p;
      }),
      fetch("/api/service-call-files").then(async (r) => {
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        return p;
      }),
    ])
      .then(([callsPayload, entries, filesPayload]) => {
        const call = (callsPayload.calls as Call[]).find(
          (item) => item.id === id,
        );
        if (!call) throw new Error("Atendimento não encontrado.");
        setData({
          call,
          ...entries,
          photos: (filesPayload.files as Photo[]).filter(
            (file) => file.serviceCallId === id,
          ),
        });
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível preparar o relatório.",
        ),
      );
  }, []);
  if (error)
    return (
      <main className="proposal-print-state">
        <strong>{error}</strong>
        <button onClick={() => window.history.back()}>Voltar</button>
      </main>
    );
  if (!data)
    return (
      <main className="proposal-print-state">
        <Loader2 className="spin" />
        <span>Preparando relatório do atendimento...</span>
      </main>
    );
  const { call, services, materials, equipment, expenses, photos } = data;
  return (
    <main className="service-report-page">
      <nav className="proposal-print-toolbar" aria-label="Ações do relatório">
        <button onClick={() => window.history.back()}>
          <ArrowLeft /> Voltar
        </button>
        <span>Relatório do atendimento</span>
        <button className="primary" onClick={() => window.print()}>
          <Printer /> Imprimir / Salvar em PDF
        </button>
      </nav>
      <article className="service-report-document">
        <header className="proposal-document-header">
          <img
            src="/tdk-logo-documento.png"
            alt="TDK — Soluções que Transformam"
          />
          <div>
            <span>RELATÓRIO DE ATENDIMENTO</span>
            <h1>{displayNumber(call.number)}</h1>
            <p>Gerado em {dateTime(new Date().toISOString())}</p>
          </div>
        </header>
        <section className="service-report-title">
          <small>CLIENTE</small>
          <h2>{call.companyName}</h2>
          <p>{call.subject}</p>
        </section>
        <section className="service-report-facts">
          <div>
            <small>STATUS</small>
            <strong>{statusLabels[call.status] ?? call.status}</strong>
          </div>
          <div>
            <small>CHAMADO DO CLIENTE</small>
            <strong>{call.customerTicket || "Não informado"}</strong>
          </div>
          <div>
            <small>TOMADOR</small>
            <strong>{call.serviceTaker || "Não informado"}</strong>
          </div>
          <div>
            <small>LOCALIDADE</small>
            <strong>{call.location || "Não informada"}</strong>
          </div>
          <div>
            <small>CONTATO</small>
            <strong>{call.contactName || "Não informado"}</strong>
          </div>
          <div>
            <small>DEPARTAMENTO</small>
            <strong>{call.department || "Não informado"}</strong>
          </div>
          <div>
            <small>TÉCNICO</small>
            <strong>{call.technician || "Não informado"}</strong>
          </div>
          <div>
            <small>AGENDAMENTO</small>
            <strong>{dateTime(call.scheduledAt)}</strong>
          </div>
        </section>
        <section className="service-report-section">
          <h2>Solicitação</h2>
          <p>{call.description}</p>
        </section>
        {call.executedService && (
          <section className="service-report-section">
            <h2>Resumo da execução</h2>
            <p>{call.executedService}</p>
          </section>
        )}
        <EntryTable title="Serviços executados" entries={services} />
        <EntryTable title="Materiais utilizados" entries={materials} />
        <EntryTable title="Equipamentos, partes e peças" entries={equipment} />
        <EntryTable title="Despesas" entries={expenses} expense />
        <section className="service-report-section">
          <h2>Fotos e evidências</h2>
          {photos.length ? (
            <div className="service-report-photos">
              {photos.map((photo) => (
                <figure key={photo.id}>
                  <img
                    src={`/api/service-call-files?id=${photo.id}`}
                    alt={photo.name}
                  />
                  <figcaption>
                    {photo.name}
                    <small>
                      {photo.uploadedBy} · {dateTime(photo.createdAt)}
                    </small>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p>Nenhuma foto anexada.</p>
          )}
        </section>
        <footer>TDK Telecomunicações · Soluções que Transformam</footer>
      </article>
    </main>
  );
}

function EntryTable({
  title,
  entries,
  expense = false,
}: {
  title: string;
  entries: Entry[];
  expense?: boolean;
}) {
  if (!entries.length) return null;
  return (
    <section className="service-report-section">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Descrição</th>
            <th>{expense ? "Categoria" : "Quantidade"}</th>
            <th>{expense ? "Valor" : "Detalhes"}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.description}</td>
              <td>
                {expense
                  ? entry.category
                  : `${entry.quantity ?? 1} ${entry.unit ?? "un"}`}
              </td>
              <td>
                {expense
                  ? money(entry.amount ?? 0)
                  : [
                      entry.brandModel,
                      entry.technician,
                      entry.installedSerial &&
                        `Serial instalado: ${entry.installedSerial}`,
                      entry.notes,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
