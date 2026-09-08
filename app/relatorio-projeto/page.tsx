"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Download, Loader2, Paperclip, Printer } from "lucide-react";

type Item = {
  id?: number;
  category: "material" | "servico";
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};
type Sale = {
  id: number;
  proposalId: number;
  number: string;
  companyName: string;
  opportunityTitle: string;
  status: string;
  projectStatus: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  projectManager: string | null;
  projectMembers: string[];
  progress: number;
  projectNotes: string | null;
  total: number;
  cost: number;
  createdAt: string;
  items: Item[];
};
type Proposal = {
  id: number;
  number: string;
  customerOrder: string | null;
  requester: string | null;
  status: string;
  priceTable: string;
  validUntil: string | null;
  discount: number;
  subtotal: number;
  total: number;
  notes: string | null;
  createdAt: string;
  items: Item[];
};
type Task = {
  id: number;
  saleId: number;
  title: string;
  responsible: string | null;
  dueDate: string | null;
  completedAt: string | null;
};
type ProjectFile = {
  id: number;
  saleId: number;
  name: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
};
type TeamMember = { id: number; name: string };

const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${value.slice(0, 10)}T12:00:00Z`),
      )
    : "Não informada";
const statusLabel = (value: string) =>
  ({
    aguardando: "Aguardando",
    andamento: "Em andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
    rascunho: "Rascunho",
    enviada: "Enviada",
    aprovada: "Aprovada",
    recusada: "Recusada",
    expirada: "Expirada",
  })[value] ?? value;

export default function ProjectReportPage() {
  const [data, setData] = useState<{
    sale: Sale;
    proposal: Proposal | null;
    tasks: Task[];
    files: ProjectFile[];
    team: TeamMember[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("id"));
    if (!id) {
      queueMicrotask(() => setError("Projeto não informado."));
      return;
    }
    Promise.all(
      [
        "/api/sales",
        "/api/proposals",
        "/api/project-tasks",
        "/api/project-files",
        "/api/team",
      ].map((url) =>
        fetch(url).then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error);
          return payload;
        }),
      ),
    )
      .then(
        ([
          salesPayload,
          proposalsPayload,
          tasksPayload,
          filesPayload,
          teamPayload,
        ]) => {
          const sale = (salesPayload.sales as Sale[]).find(
            (item) => item.id === id,
          );
          if (!sale) throw new Error("Projeto não encontrado.");
          setData({
            sale,
            proposal:
              (proposalsPayload.proposals as Proposal[]).find(
                (item) => item.id === sale.proposalId,
              ) ?? null,
            tasks: (tasksPayload.tasks as Task[]).filter(
              (item) => item.saleId === id,
            ),
            files: (filesPayload.files as ProjectFile[]).filter(
              (item) => item.saleId === id,
            ),
            team: teamPayload.team as TeamMember[],
          });
        },
      )
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
        <span>Preparando relatório do projeto...</span>
      </main>
    );
  const { sale, proposal, tasks, files, team } = data,
    photos = files.filter((file) => file.contentType.startsWith("image/")),
    documents = files.filter((file) => !file.contentType.startsWith("image/")),
    items = proposal?.items.length ? proposal.items : sale.items;
  return (
    <main className="project-report-page">
      <nav className="proposal-print-toolbar" aria-label="Ações do relatório">
        <button onClick={() => window.history.back()}>
          <ArrowLeft /> Voltar
        </button>
        <span>Relatório completo do projeto</span>
        <button className="primary" onClick={() => window.print()}>
          <Printer /> Imprimir / Salvar em PDF
        </button>
      </nav>
      <article className="project-report-document">
        <header className="proposal-document-header">
          <img
            src="/tdk-logo-documento.png"
            alt="TDK Telecomunicações — Soluções que Transformam"
          />
          <div>
            <span>RELATÓRIO DO PROJETO</span>
            <h1>{sale.number}</h1>
            <p>Gerado em {date(new Date().toISOString())}</p>
          </div>
        </header>
        <section className="project-report-title">
          <small>CLIENTE</small>
          <h2>{sale.companyName}</h2>
          <p>{sale.opportunityTitle}</p>
        </section>
        <section className="project-report-facts">
          <div>
            <small>PROPOSTA</small>
            <strong>{proposal?.number ?? "Não informada"}</strong>
          </div>
          <div>
            <small>PEDIDO DO CLIENTE</small>
            <strong>{proposal?.customerOrder ?? "Não informado"}</strong>
          </div>
          <div>
            <small>SOLICITANTE</small>
            <strong>{proposal?.requester ?? "Não informado"}</strong>
          </div>
          <div>
            <small>STATUS DO PEDIDO</small>
            <strong>{statusLabel(sale.status)}</strong>
          </div>
          <div>
            <small>STATUS DO PROJETO</small>
            <strong>{statusLabel(sale.projectStatus)}</strong>
          </div>
          <div>
            <small>GESTOR DO PROJETO</small>
            <strong>{sale.projectManager ?? "Não informado"}</strong>
          </div>
          <div>
            <small>INÍCIO</small>
            <strong>{date(sale.scheduledStart)}</strong>
          </div>
          <div>
            <small>CONCLUSÃO PREVISTA</small>
            <strong>{date(sale.scheduledEnd)}</strong>
          </div>
        </section>
        <section className="project-report-progress">
          <div>
            <span>Progresso da execução</span>
            <strong>{sale.progress}%</strong>
          </div>
          <i>
            <b
              style={{ width: `${Math.min(100, Math.max(0, sale.progress))}%` }}
            />
          </i>
        </section>
        <section className="project-report-section">
          <h2>Equipe técnica</h2>
          <p>
            {sale.projectMembers.length
              ? sale.projectMembers
                  .map(
                    (id) =>
                      team.find((member) => String(member.id) === id)?.name ??
                      id,
                  )
                  .join(", ")
              : "Nenhum integrante informado."}
          </p>
        </section>
        <section className="project-report-section">
          <h2>Itens do projeto</h2>
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Qtd.</th>
                <th>Valor unitário</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id ?? index}>
                  <td>
                    {item.category === "material" ? "Material" : "Serviço"}
                  </td>
                  <td>{item.description}</td>
                  <td>{Number(item.quantity).toLocaleString("pt-BR")}</td>
                  <td>{currency(Number(item.unitPrice))}</td>
                  <td>{currency(Number(item.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="project-report-total">
            <span>Valor total do projeto</span>
            <strong>{currency(sale.total)}</strong>
          </div>
        </section>
        <section className="project-report-section">
          <h2>Etapas e tarefas</h2>
          {tasks.length ? (
            <div className="project-report-tasks">
              {tasks.map((task) => (
                <div key={task.id} className={task.completedAt ? "done" : ""}>
                  <b>{task.completedAt ? "✓" : "○"}</b>
                  <span>
                    <strong>{task.title}</strong>
                    <small>
                      {task.responsible || "Sem responsável"} ·{" "}
                      {task.dueDate ? date(task.dueDate) : "Sem prazo"}
                    </small>
                  </span>
                  <em>{task.completedAt ? "Concluída" : "Pendente"}</em>
                </div>
              ))}
            </div>
          ) : (
            <p>Nenhuma tarefa registrada.</p>
          )}
        </section>
        <section className="project-report-section">
          <h2>Observações da execução</h2>
          <p className="pre-line">
            {sale.projectNotes || "Nenhuma observação registrada."}
          </p>
        </section>
        {proposal?.notes && (
          <section className="project-report-section">
            <h2>Condições e observações da proposta</h2>
            <p className="pre-line">{proposal.notes}</p>
          </section>
        )}
        <section className="project-report-section">
          <h2>Fotos e evidências</h2>
          {photos.length ? (
            <div className="project-report-photos">
              {photos.map((file) => (
                <figure key={file.id}>
                  <img
                    src={`/api/project-files?id=${file.id}&inline=1`}
                    alt={file.name}
                  />
                  <figcaption>
                    {file.name}
                    <small>
                      Enviado por {file.uploadedBy} em {date(file.createdAt)}
                    </small>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p>Nenhuma foto anexada ao projeto.</p>
          )}
        </section>
        {documents.length > 0 && (
          <section className="project-report-section no-print-break">
            <h2>Documentos anexados</h2>
            <div className="project-report-files">
              {documents.map((file) => (
                <a
                  key={file.id}
                  href={`/api/project-files?id=${file.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Paperclip />
                  <span>
                    <strong>{file.name}</strong>
                    <small>
                      {(file.size / 1024 / 1024).toFixed(
                        file.size > 1048576 ? 1 : 2,
                      )}{" "}
                      MB · {file.uploadedBy}
                    </small>
                  </span>
                  <Download />
                </a>
              ))}
            </div>
          </section>
        )}
        <footer>
          <strong>TDK Telecomunicações</strong>
          <span>
            Rua Silva Bueno, 2122 · Cjs. 12 e 22 · Ipiranga · São Paulo/SP · CEP
            04208-002
          </span>
          <span>tdktelecomunicacoes.com.br</span>
        </footer>
      </article>
    </main>
  );
}
