"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

type ProposalItem = { id: number; category: "material" | "servico"; description: string; quantity: number; unitPrice: number; total: number };
type Proposal = { id: number; opportunityTitle: string; companyName: string; number: string; status: string; validUntil: string | null; discount: number; subtotal: number; total: number; notes: string | null; createdAt: string; items: ProposalItem[] };

const currency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value.includes("T") ? value : `${value}T12:00:00Z`));

export default function ProposalDocumentPage() {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { setError("Proposta não informada."); return; }
    fetch(`/api/proposals?id=${encodeURIComponent(id)}`)
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then((data) => setProposal(data.proposal))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar a proposta."));
  }, []);

  if (error) return <main className="proposal-print-state"><strong>{error}</strong><button onClick={() => window.close()}>Fechar</button></main>;
  if (!proposal) return <main className="proposal-print-state"><Loader2 className="spin" /><span>Preparando proposta...</span></main>;

  const sections = [
    { key: "material", title: "Materiais" },
    { key: "servico", title: "Serviços" },
  ] as const;

  return <main className="proposal-print-page">
    <nav className="proposal-print-toolbar" aria-label="Ações da proposta">
      <button onClick={() => window.close()}><ArrowLeft /> Voltar</button>
      <span>Confira os dados antes de salvar</span>
      <button className="primary" onClick={() => window.print()}><Printer /> Imprimir / Salvar em PDF</button>
    </nav>
    <article className="proposal-document">
      <header className="proposal-document-header">
        <img src="/tdk-logo-oficial.png" alt="TDK Telecomunicações" />
        <div><span>PROPOSTA COMERCIAL</span><h1>{proposal.number}</h1><p>Emitida em {date(proposal.createdAt)}</p></div>
      </header>
      <section className="proposal-client-block">
        <div><small>CLIENTE</small><strong>{proposal.companyName}</strong></div>
        <div><small>OPORTUNIDADE</small><strong>{proposal.opportunityTitle}</strong></div>
        <div><small>VALIDADE</small><strong>{proposal.validUntil ? date(proposal.validUntil) : "Não informada"}</strong></div>
      </section>
      {sections.map((section) => {
        const items = proposal.items.filter((item) => item.category === section.key);
        if (!items.length) return null;
        return <section className="proposal-document-section" key={section.key}>
          <h2>{section.title}</h2>
          <table><thead><tr><th>Descrição</th><th>Qtd.</th><th>Valor unitário</th><th>Total</th></tr></thead><tbody>
            {items.map((item) => <tr key={item.id}><td>{item.description}</td><td>{Number(item.quantity).toLocaleString("pt-BR")}</td><td>{currency(item.unitPrice)}</td><td>{currency(item.total)}</td></tr>)}
          </tbody></table>
        </section>;
      })}
      <section className="proposal-document-closing">
        <div className="proposal-conditions"><h2>Condições comerciais</h2><p>{proposal.notes || "Conforme condições acordadas com o cliente."}</p></div>
        <div className="proposal-document-total"><span>Subtotal <strong>{currency(proposal.subtotal)}</strong></span><span>Desconto <strong>{currency(proposal.discount)}</strong></span><b>Total da proposta <strong>{currency(proposal.total)}</strong></b></div>
      </section>
      <footer><strong>TDK Telecomunicações</strong><span>Rua Silva Bueno, 2122 · Cjs. 12 e 22 · Ipiranga · São Paulo/SP · CEP 04208-002</span><span>tdktelecomunicacoes.com.br</span></footer>
    </article>
  </main>;
}
