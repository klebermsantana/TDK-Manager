"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Contact,
  LayoutDashboard,
  Loader2,
  Mail,
  Menu,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Settings,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

type View = "dashboard" | "pipeline" | "companies" | "contacts";
type Opportunity = {
  id: number;
  title: string;
  companyId: number | null;
  company: string;
  value: number;
  owner: string;
  initials: string;
  due: string;
  stage: string;
  temperature: "hot" | "warm" | "cold";
};
type ApiOpportunity = {
  id: number;
  title: string;
  companyId: number | null;
  companyName: string;
  value: number;
  ownerName: string;
  expectedCloseAt: string | null;
  stage: string;
  temperature: "hot" | "warm" | "cold";
};
type Company = {
  id: number;
  name: string;
  document: string | null;
  segment: string | null;
  createdAt: string;
};
type ContactRecord = {
  id: number;
  companyId: number;
  companyName: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
};

const stages = [
  { id: "novo", label: "Novo lead", color: "#38bdf8" },
  { id: "qualificacao", label: "Qualificação", color: "#818cf8" },
  { id: "proposta", label: "Proposta enviada", color: "#f59e0b" },
  { id: "negociacao", label: "Negociação", color: "#a78bfa" },
  { id: "ganho", label: "Venda ganha", color: "#22c55e" },
];
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "TD";
const dueLabel = (date: string | null) =>
  date
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      })
        .format(new Date(`${date}T12:00:00Z`))
        .replace(".", "")
    : "Sem data";
const fromApi = (item: ApiOpportunity): Opportunity => ({
  id: item.id,
  title: item.title,
  companyId: item.companyId,
  company: item.companyName,
  value: item.value,
  owner: item.ownerName,
  initials: initials(item.ownerName),
  due: dueLabel(item.expectedCloseAt),
  stage: item.stage,
  temperature: item.temperature,
});

export default function CrmDashboard({
  user,
}: {
  user: { name: string; email: string };
}) {
  const [view, setView] = useState<View>("pipeline");
  const [items, setItems] = useState<Opportunity[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<
    "opportunity" | "company" | "contact" | null
  >(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [opportunityForm, setOpportunityForm] = useState({
    title: "",
    companyId: "",
    value: "",
    expectedCloseAt: "",
  });
  const [companyForm, setCompanyForm] = useState({
    name: "",
    document: "",
    segment: "",
  });
  const [contactForm, setContactForm] = useState({
    name: "",
    companyId: "",
    role: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const responses = await Promise.all(
          ["/api/opportunities", "/api/companies", "/api/contacts"].map((url) =>
            fetch(url, { cache: "no-store" }),
          ),
        );
        const payloads = await Promise.all(
          responses.map((response) => response.json()),
        );
        const failed = responses.findIndex((response) => !response.ok);
        if (failed >= 0) throw new Error(payloads[failed].error);
        if (active) {
          setItems(
            (payloads[0].opportunities as ApiOpportunity[]).map(fromApi),
          );
          setCompanies(payloads[1].companies);
          setContacts(payloads[2].contacts);
        }
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível carregar os dados do CRM.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        `${item.title} ${item.company}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [items, query],
  );
  const filteredCompanies = useMemo(
    () =>
      companies.filter((company) =>
        `${company.name} ${company.document ?? ""} ${company.segment ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [companies, query],
  );
  const filteredContacts = useMemo(
    () =>
      contacts.filter((contact) =>
        `${contact.name} ${contact.companyName} ${contact.email ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [contacts, query],
  );
  const pipeline = items
    .filter((item) => item.stage !== "ganho")
    .reduce((sum, item) => sum + item.value, 0);
  const won = items
    .filter((item) => item.stage === "ganho")
    .reduce((sum, item) => sum + item.value, 0);

  function navigate(next: View) {
    setView(next);
    setMenuOpen(false);
    setQuery("");
  }
  async function move(stage: string) {
    const id = dragId;
    if (!id) return;
    const previous = items;
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, stage } : item)),
    );
    setDragId(null);
    setError("");
    try {
      const response = await fetch("/api/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, stage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
    } catch (reason) {
      setItems(previous);
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível mover a oportunidade.",
      );
    }
  }
  async function createOpportunity(event: React.FormEvent) {
    event.preventDefault();
    const company = companies.find(
      (item) => item.id === Number(opportunityForm.companyId),
    );
    if (!company) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: opportunityForm.title,
          companyId: company.id,
          companyName: company.name,
          value: Number(opportunityForm.value) || 0,
          expectedCloseAt: opportunityForm.expectedCloseAt || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems((current) => [fromApi(data.opportunity), ...current]);
      setOpportunityForm({
        title: "",
        companyId: "",
        value: "",
        expectedCloseAt: "",
      });
      setDialog(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível cadastrar a oportunidade.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function createCompany(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCompanies((current) =>
        [...current, data.company].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setCompanyForm({ name: "", document: "", segment: "" });
      setDialog(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível cadastrar a empresa.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function createContact(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contactForm,
          companyId: Number(contactForm.companyId),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setContacts((current) =>
        [...current, data.contact].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setContactForm({
        name: "",
        companyId: "",
        role: "",
        email: "",
        phone: "",
      });
      setDialog(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível cadastrar o contato.",
      );
    } finally {
      setSaving(false);
    }
  }

  const titles: { [key in View]: [string, string, string] } = {
    dashboard: [
      "GESTÃO • VISÃO GERAL",
      "Dashboard comercial",
      "Resultados e ritmo da equipe em um só lugar.",
    ],
    pipeline: [
      "CRM • VISÃO COMERCIAL",
      "Funil de vendas",
      "Acompanhe cada oportunidade até o fechamento.",
    ],
    companies: [
      "CRM • CARTEIRA DE CLIENTES",
      "Empresas",
      "Centralize clientes e prospects relacionados às oportunidades.",
    ],
    contacts: [
      "CRM • RELACIONAMENTO",
      "Contatos",
      "Organize as pessoas-chave de cada empresa.",
    ],
  };
  const primaryAction =
    view === "companies"
      ? () => setDialog("company")
      : view === "contacts"
        ? () => setDialog("contact")
        : () => setDialog("opportunity");
  const primaryLabel =
    view === "companies"
      ? "Nova empresa"
      : view === "contacts"
        ? "Novo contato"
        : "Nova oportunidade";

  return (
    <div className="app-shell">
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <img
            className="brand-logo"
            src="/tdk-logo-oficial.png"
            alt="TDK — Soluções que Transformam"
          />
          <div className="product-name">
            <strong>Manager</strong>
            <span>Gestão inteligente</span>
          </div>
          <button
            className="close-mobile"
            onClick={() => setMenuOpen(false)}
            aria-label="Fechar menu"
          >
            <X />
          </button>
        </div>
        <nav>
          <p>VISÃO GERAL</p>
          <NavButton
            active={view === "dashboard"}
            onClick={() => navigate("dashboard")}
            icon={<LayoutDashboard />}
          >
            Dashboard
          </NavButton>
          <p>COMERCIAL</p>
          <NavButton
            active={view === "pipeline"}
            onClick={() => navigate("pipeline")}
            icon={<BriefcaseBusiness />}
          >
            Oportunidades <span className="nav-count">{items.length}</span>
          </NavButton>
          <NavButton
            active={view === "companies"}
            onClick={() => navigate("companies")}
            icon={<Building2 />}
          >
            Empresas <span className="nav-count">{companies.length}</span>
          </NavButton>
          <NavButton
            active={view === "contacts"}
            onClick={() => navigate("contacts")}
            icon={<Contact />}
          >
            Contatos
          </NavButton>
          <NavButton icon={<CalendarClock />}>Atividades</NavButton>
          <NavButton icon={<Target />}>Metas</NavButton>
          <p>GESTÃO</p>
          <NavButton icon={<CircleDollarSign />}>Propostas</NavButton>
          <NavButton icon={<Users />}>Equipe e permissões</NavButton>
          <NavButton icon={<TrendingUp />}>Relatórios</NavButton>
        </nav>
        <div className="sidebar-footer">
          <button>
            <Settings /> Configurações
          </button>
          <div className="user">
            <span>{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>Administrador</small>
            </div>
            <ChevronDown />
          </div>
        </div>
      </aside>
      <main className="main">
        <header>
          <button
            className="menu-mobile"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </button>
          <div className="global-search">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar no CRM..."
            />
          </div>
          <button className="icon-button" aria-label="Notificações">
            <Bell />
            <i />
          </button>
          <div className="header-date">
            <span>Visão comercial</span>
            <strong>Setembro de 2026</strong>
          </div>
        </header>
        <div className="content">
          {error && (
            <div className="data-alert" role="alert">
              <span>{error}</span>
              <button onClick={() => setError("")}>Fechar</button>
            </div>
          )}
          <section className="title-row">
            <div>
              <span className="eyebrow">{titles[view][0]}</span>
              <h1>{titles[view][1]}</h1>
              <p>{titles[view][2]}</p>
            </div>
            <Button className="new-button" onClick={primaryAction}>
              <Plus /> {primaryLabel}
            </Button>
          </section>
          {view === "dashboard" || view === "pipeline" ? (
            <Metrics pipeline={pipeline} won={won} />
          ) : null}
          {loading ? (
            <Loading />
          ) : view === "dashboard" ? (
            <Dashboard items={items} />
          ) : view === "pipeline" ? (
            <Pipeline
              items={filteredItems}
              drag={setDragId}
              move={move}
              add={() => setDialog("opportunity")}
            />
          ) : view === "companies" ? (
            <Companies
              companies={filteredCompanies}
              contacts={contacts}
              opportunities={items}
              add={() => setDialog("company")}
            />
          ) : (
            <Contacts
              contacts={filteredContacts}
              add={() => setDialog("contact")}
            />
          )}
        </div>
      </main>

      <Dialog
        open={dialog === "opportunity"}
        onOpenChange={(open) => setDialog(open ? "opportunity" : null)}
      >
        <DialogContent className="dialog">
          <DialogHeader>
            <span className="dialog-kicker">CADASTRO COMERCIAL</span>
            <DialogTitle>Nova oportunidade</DialogTitle>
            <DialogDescription>
              Registre uma oportunidade e vincule-a à empresa responsável.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createOpportunity} className="form">
            <Field label="Oportunidade">
              <Input
                value={opportunityForm.title}
                onChange={(event) =>
                  setOpportunityForm({
                    ...opportunityForm,
                    title: event.target.value,
                  })
                }
                placeholder="Ex.: Projeto de rede Wi‑Fi"
                required
              />
            </Field>
            <Field label="Empresa">
              <select
                value={opportunityForm.companyId}
                onChange={(event) =>
                  setOpportunityForm({
                    ...opportunityForm,
                    companyId: event.target.value,
                  })
                }
                required
              >
                <option value="">Selecione uma empresa</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              {companies.length === 0 && (
                <small>
                  Cadastre uma empresa antes de criar a oportunidade.
                </small>
              )}
            </Field>
            <Field label="Valor estimado">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={opportunityForm.value}
                onChange={(event) =>
                  setOpportunityForm({
                    ...opportunityForm,
                    value: event.target.value,
                  })
                }
                placeholder="0,00"
              />
            </Field>
            <Field label="Previsão de fechamento">
              <Input
                type="date"
                value={opportunityForm.expectedCloseAt}
                onChange={(event) =>
                  setOpportunityForm({
                    ...opportunityForm,
                    expectedCloseAt: event.target.value,
                  })
                }
              />
            </Field>
            <SaveButton saving={saving} disabled={!companies.length}>
              Cadastrar oportunidade
            </SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "company"}
        onOpenChange={(open) => setDialog(open ? "company" : null)}
      >
        <DialogContent className="dialog">
          <DialogHeader>
            <span className="dialog-kicker">CARTEIRA DE CLIENTES</span>
            <DialogTitle>Nova empresa</DialogTitle>
            <DialogDescription>
              Cadastre os dados principais do cliente ou prospect.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createCompany} className="form">
            <Field label="Razão social ou nome">
              <Input
                value={companyForm.name}
                onChange={(event) =>
                  setCompanyForm({ ...companyForm, name: event.target.value })
                }
                placeholder="Nome da empresa"
                required
              />
            </Field>
            <Field label="CNPJ ou CPF">
              <Input
                value={companyForm.document}
                onChange={(event) =>
                  setCompanyForm({
                    ...companyForm,
                    document: event.target.value,
                  })
                }
                placeholder="00.000.000/0000-00"
              />
            </Field>
            <Field label="Segmento">
              <Input
                value={companyForm.segment}
                onChange={(event) =>
                  setCompanyForm({
                    ...companyForm,
                    segment: event.target.value,
                  })
                }
                placeholder="Ex.: Hotelaria, Saúde, Varejo"
              />
            </Field>
            <SaveButton saving={saving}>Cadastrar empresa</SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "contact"}
        onOpenChange={(open) => setDialog(open ? "contact" : null)}
      >
        <DialogContent className="dialog">
          <DialogHeader>
            <span className="dialog-kicker">RELACIONAMENTO</span>
            <DialogTitle>Novo contato</DialogTitle>
            <DialogDescription>
              Associe uma pessoa de contato à empresa correspondente.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createContact} className="form">
            <Field label="Empresa">
              <select
                value={contactForm.companyId}
                onChange={(event) =>
                  setContactForm({
                    ...contactForm,
                    companyId: event.target.value,
                  })
                }
                required
              >
                <option value="">Selecione uma empresa</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nome completo">
              <Input
                value={contactForm.name}
                onChange={(event) =>
                  setContactForm({ ...contactForm, name: event.target.value })
                }
                placeholder="Nome do contato"
                required
              />
            </Field>
            <Field label="Cargo">
              <Input
                value={contactForm.role}
                onChange={(event) =>
                  setContactForm({ ...contactForm, role: event.target.value })
                }
                placeholder="Ex.: Gerente de TI"
              />
            </Field>
            <div className="form-split">
              <Field label="E-mail">
                <Input
                  type="email"
                  value={contactForm.email}
                  onChange={(event) =>
                    setContactForm({
                      ...contactForm,
                      email: event.target.value,
                    })
                  }
                  placeholder="nome@empresa.com"
                />
              </Field>
              <Field label="Telefone">
                <Input
                  value={contactForm.phone}
                  onChange={(event) =>
                    setContactForm({
                      ...contactForm,
                      phone: event.target.value,
                    })
                  }
                  placeholder="(11) 99999-9999"
                />
              </Field>
            </div>
            <SaveButton saving={saving} disabled={!companies.length}>
              Cadastrar contato
            </SaveButton>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NavButton({
  active = false,
  onClick,
  icon,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function SaveButton({
  saving,
  disabled = false,
  children,
}: {
  saving: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="submit"
      className="save-button"
      disabled={saving || disabled}
    >
      {saving ? (
        <>
          <Loader2 className="spin" /> Salvando...
        </>
      ) : (
        children
      )}
    </Button>
  );
}
function Loading() {
  return (
    <div className="loading-state">
      <Loader2 className="spin" />
      <strong>Carregando dados...</strong>
    </div>
  );
}
function Metrics({ pipeline, won }: { pipeline: number; won: number }) {
  return (
    <section className="metrics">
      <Metric
        icon={<BriefcaseBusiness />}
        tone="blue"
        label="Pipeline aberto"
        value={money(pipeline)}
        note="Oportunidades em andamento"
      />
      <Metric
        icon={<CheckCircle2 />}
        tone="green"
        label="Vendas ganhas"
        value={money(won)}
        note="Total consolidado"
      />
      <Metric
        icon={<Target />}
        tone="amber"
        label="Conversão"
        value="Em apuração"
        note="Com base no histórico"
      />
      <Metric
        icon={<Clock3 />}
        tone="purple"
        label="Ciclo médio"
        value="Em apuração"
        note="Com base nos fechamentos"
      />
    </section>
  );
}
function Metric({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article>
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}
function Pipeline({
  items,
  drag,
  move,
  add,
}: {
  items: Opportunity[];
  drag: (id: number) => void;
  move: (stage: string) => void;
  add: () => void;
}) {
  return (
    <>
      <section className="toolbar">
        <div className="view-tabs">
          <button className="selected">Kanban</button>
          <button>Lista</button>
        </div>
        <div className="filters">
          <button>
            Todos os vendedores <ChevronDown />
          </button>
          <button>
            Este mês <ChevronDown />
          </button>
          <button aria-label="Mais filtros">
            <MoreHorizontal />
          </button>
        </div>
      </section>
      <section className="kanban">
        {stages.map((stage) => {
          const cards = items.filter((item) => item.stage === stage.id);
          return (
            <div
              className="column"
              key={stage.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => move(stage.id)}
            >
              <div className="column-head">
                <div>
                  <i style={{ background: stage.color }} />
                  <strong>{stage.label}</strong>
                  <span>{cards.length}</span>
                </div>
                <button aria-label="Adicionar" onClick={add}>
                  <Plus />
                </button>
              </div>
              <p className="column-total">
                {money(cards.reduce((sum, item) => sum + item.value, 0))}
              </p>
              <div className="cards">
                {cards.map((card) => (
                  <article
                    draggable
                    onDragStart={() => drag(card.id)}
                    key={card.id}
                    className="deal-card"
                  >
                    <div className="card-top">
                      <span className={`temperature ${card.temperature}`}>
                        <Zap />
                        {card.temperature === "hot"
                          ? "Alta"
                          : card.temperature === "warm"
                            ? "Média"
                            : "Baixa"}
                      </span>
                      <button aria-label="Opções">
                        <MoreHorizontal />
                      </button>
                    </div>
                    <h3>{card.title}</h3>
                    <p>
                      <Building2 />
                      {card.company}
                    </p>
                    <strong className="deal-value">{money(card.value)}</strong>
                    <div className="card-foot">
                      <span className="avatar" title={card.owner}>
                        {card.initials}
                      </span>
                      <span className="due">
                        <CalendarClock />
                        {card.due}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
              <button className="add-card" onClick={add}>
                <Plus /> Adicionar oportunidade
              </button>
            </div>
          );
        })}
      </section>
    </>
  );
}
function Companies({
  companies,
  contacts,
  opportunities,
  add,
}: {
  companies: Company[];
  contacts: ContactRecord[];
  opportunities: Opportunity[];
  add: () => void;
}) {
  if (!companies.length)
    return (
      <Empty
        icon={<Building2 />}
        title="Nenhuma empresa cadastrada"
        text="Cadastre o primeiro cliente ou prospect para começar a organizar sua carteira."
        action="Cadastrar empresa"
        onClick={add}
      />
    );
  return (
    <div className="company-grid">
      {companies.map((company) => {
        const companyContacts = contacts.filter(
          (contact) => contact.companyId === company.id,
        ).length;
        const value = opportunities
          .filter(
            (item) => item.companyId === company.id && item.stage !== "ganho",
          )
          .reduce((sum, item) => sum + item.value, 0);
        return (
          <article className="company-card" key={company.id}>
            <div className="company-head">
              <span>
                <Building2 />
              </span>
              <small>{company.segment || "Segmento não informado"}</small>
            </div>
            <h2>{company.name}</h2>
            <p>{company.document || "Documento não informado"}</p>
            <div className="company-stats">
              <span>
                <strong>{companyContacts}</strong> contatos
              </span>
              <span>
                <strong>{money(value)}</strong> pipeline
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
function Contacts({
  contacts,
  add,
}: {
  contacts: ContactRecord[];
  add: () => void;
}) {
  if (!contacts.length)
    return (
      <Empty
        icon={<Contact />}
        title="Nenhum contato cadastrado"
        text="Adicione as pessoas responsáveis pelas decisões e próximos passos em cada empresa."
        action="Cadastrar contato"
        onClick={add}
      />
    );
  return (
    <div className="data-table">
      <div className="table-row table-head">
        <span>Contato</span>
        <span>Empresa</span>
        <span>Cargo</span>
        <span>Comunicação</span>
      </div>
      {contacts.map((contact) => (
        <div className="table-row" key={contact.id}>
          <span className="contact-name">
            <i>{initials(contact.name)}</i>
            <strong>{contact.name}</strong>
          </span>
          <span>{contact.companyName}</span>
          <span>{contact.role || "Não informado"}</span>
          <span className="contact-links">
            {contact.email && (
              <a href={`mailto:${contact.email}`}>
                <Mail />
                {contact.email}
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`}>
                <Phone />
                {contact.phone}
              </a>
            )}
            {!contact.email && !contact.phone && <small>Não informado</small>}
          </span>
        </div>
      ))}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="empty-crm">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      <Button onClick={onClick}>
        <Plus />
        {action}
      </Button>
    </div>
  );
}
function Dashboard({ items }: { items: Opportunity[] }) {
  const grouped = new Map<string, number>();
  items.forEach((item) =>
    grouped.set(item.owner, (grouped.get(item.owner) || 0) + item.value),
  );
  const owners = [...grouped]
    .map(([name, value]) => ({ name, value }))
    .slice(0, 3);
  return (
    <div className="dashboard-grid">
      <article className="panel chart-panel">
        <div className="panel-head">
          <div>
            <span>PREVISÃO DE RECEITA</span>
            <h2>Desempenho comercial</h2>
          </div>
          <button>
            Últimos 6 meses <ChevronDown />
          </button>
        </div>
        <div className="bars">
          {[42, 55, 48, 68, 61, 82].map((height, index) => (
            <div key={index}>
              <span style={{ height: `${height}%` }} />
              <small>{["Abr", "Mai", "Jun", "Jul", "Ago", "Set"][index]}</small>
            </div>
          ))}
        </div>
      </article>
      <article className="panel team-panel">
        <div className="panel-head">
          <div>
            <span>EQUIPE</span>
            <h2>Pipeline por vendedor</h2>
          </div>
        </div>
        {owners.length ? (
          owners.map((owner, index) => (
            <div className="seller" key={owner.name}>
              <span className={`seller-avatar a${index}`}>
                {initials(owner.name)}
              </span>
              <div>
                <strong>{owner.name}</strong>
                <Progress value={Math.min(owner.value / 3000, 100)} />
              </div>
              <b>{money(owner.value)}</b>
            </div>
          ))
        ) : (
          <p className="panel-empty">
            Os resultados aparecerão após os primeiros cadastros.
          </p>
        )}
      </article>
      <article className="panel wide">
        <div className="panel-head">
          <div>
            <span>ATENÇÃO</span>
            <h2>Próximas ações</h2>
          </div>
        </div>
        <div className="actions">
          <div>
            <Clock3 />
            <span>
              <strong>Acompanhe o funil diariamente</strong>
              <small>Mantenha as oportunidades na etapa correta</small>
            </span>
            <button>Ver funil</button>
          </div>
          <div>
            <CalendarClock />
            <span>
              <strong>Registre as previsões</strong>
              <small>Use a data estimada de fechamento</small>
            </span>
            <button>Ver agenda</button>
          </div>
        </div>
      </article>
    </div>
  );
}
