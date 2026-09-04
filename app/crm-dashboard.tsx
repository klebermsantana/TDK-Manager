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
  FileText,
  LayoutDashboard,
  Loader2,
  Mail,
  Menu,
  MoreHorizontal,
  PackageOpen,
  Pencil,
  Phone,
  Plus,
  Printer,
  Search,
  Settings,
  Target,
  TrendingUp,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type View = "dashboard" | "pipeline" | "companies" | "contacts" | "activities" | "proposals" | "catalog";
type Opportunity = {
  id: number;
  title: string;
  companyId: number | null;
  company: string;
  value: number;
  owner: string;
  initials: string;
  due: string;
  expectedCloseAt: string | null;
  probability: number;
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
  probability: number;
  temperature: "hot" | "warm" | "cold";
};
type Company = {
  id: number;
  name: string;
  document: string | null;
  segment: string | null;
  preferredPriceTable: string;
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
type ActivityRecord = {
  id: number;
  opportunityId: number;
  opportunityTitle: string;
  companyName: string;
  type: string;
  description: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
};
type ProposalItem = { id?: number; proposalId?: number; catalogId?: number; category: "material" | "servico"; description: string; quantity: number | string; unitCost: number | string; unitPrice: number | string; total?: number };
type ProposalRecord = { id: number; opportunityId: number; opportunityTitle: string; companyName: string; number: string; status: string; priceTable: string; validUntil: string | null; discount: number; subtotal: number; total: number; notes: string | null; createdAt: string; items: ProposalItem[] };
type CatalogItem = { id: number; category: "material" | "servico"; code: string | null; description: string; unit: string; cost: number; competitivePrice: number; standardPrice: number; valuePrice: number; active: boolean };

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
  expectedCloseAt: item.expectedCloseAt,
  probability: item.probability,
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
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [proposals, setProposals] = useState<ProposalRecord[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<
    "opportunity" | "company" | "contact" | "activity" | "proposal" | "catalog" | null
  >(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "company" | "contact" | "opportunity"; id: number; name: string } | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<number | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<number | null>(null);
  const [editingProposalId, setEditingProposalId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [opportunityForm, setOpportunityForm] = useState({
    title: "",
    companyId: "",
    value: "",
    expectedCloseAt: "",
    probability: "10",
    temperature: "warm" as "cold" | "warm" | "hot",
  });
  const [companyForm, setCompanyForm] = useState({
    name: "",
    document: "",
    segment: "",
    preferredPriceTable: "padrao",
  });
  const [contactForm, setContactForm] = useState({
    name: "",
    companyId: "",
    role: "",
    email: "",
    phone: "",
  });
  const [activityForm, setActivityForm] = useState({ opportunityId: "", type: "retorno", description: "", dueAt: "" });
  const [proposalForm, setProposalForm] = useState<{ opportunityId: string; priceTable: string; validUntil: string; discount: string; notes: string; items: ProposalItem[] }>({ opportunityId: "", priceTable: "padrao", validUntil: "", discount: "0", notes: "", items: [{ category: "servico", description: "", quantity: 1, unitCost: "", unitPrice: "" }] });
  const [catalogForm, setCatalogForm] = useState({ category: "material" as "material"|"servico", code: "", description: "", unit: "un", cost: "", competitivePrice: "", standardPrice: "", valuePrice: "" });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const responses = await Promise.all(
          ["/api/opportunities", "/api/companies", "/api/contacts", "/api/activities", "/api/proposals", "/api/catalog"].map((url) =>
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
          setActivities(payloads[3].activities);
          setProposals(payloads[4].proposals);
          setCatalog(payloads[5].catalog);
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
  function openNew(kind: "company" | "contact" | "opportunity" | "activity" | "proposal" | "catalog") {
    setEditingId(null);
    if (kind === "company") setCompanyForm({ name: "", document: "", segment: "", preferredPriceTable: "padrao" });
    if (kind === "contact") setContactForm({ name: "", companyId: "", role: "", email: "", phone: "" });
    if (kind === "opportunity") setOpportunityForm({ title: "", companyId: "", value: "", expectedCloseAt: "", probability: "10", temperature: "warm" });
    if (kind === "activity") setActivityForm({ opportunityId: "", type: "retorno", description: "", dueAt: "" });
    if (kind === "proposal") setProposalForm({ opportunityId: "", priceTable: "padrao", validUntil: "", discount: "0", notes: "", items: [{ category: "servico", description: "", quantity: 1, unitCost: "", unitPrice: "" }] });
    if (kind === "proposal") setEditingProposalId(null);
    if (kind === "catalog") { setEditingId(null); setCatalogForm({ category:"material",code:"",description:"",unit:"un",cost:"",competitivePrice:"",standardPrice:"",valuePrice:"" }); }
    setDialog(kind);
  }
  function editCompany(company: Company) {
    setEditingId(company.id);
    setCompanyForm({ name: company.name, document: company.document ?? "", segment: company.segment ?? "", preferredPriceTable: company.preferredPriceTable ?? "padrao" });
    setDialog("company");
  }
  function editContact(contact: ContactRecord) {
    setEditingId(contact.id);
    setContactForm({ name: contact.name, companyId: String(contact.companyId), role: contact.role ?? "", email: contact.email ?? "", phone: contact.phone ?? "" });
    setDialog("contact");
  }
  function editOpportunity(item: Opportunity) {
    setEditingId(item.id);
    setOpportunityForm({ title: item.title, companyId: String(item.companyId ?? ""), value: String(item.value), expectedCloseAt: item.expectedCloseAt ?? "", probability: String(item.probability), temperature: item.temperature });
    setDialog("opportunity");
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
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          title: opportunityForm.title,
          companyId: company.id,
          companyName: company.name,
          value: Number(opportunityForm.value) || 0,
          probability: Number(opportunityForm.probability),
          temperature: opportunityForm.temperature,
          expectedCloseAt: opportunityForm.expectedCloseAt || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems((current) => editingId
        ? current.map((item) => item.id === editingId ? fromApi(data.opportunity) : item)
        : [fromApi(data.opportunity), ...current]);
      setOpportunityForm({
        title: "",
        companyId: "",
        value: "",
        expectedCloseAt: "",
        probability: "10",
        temperature: "warm",
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
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...companyForm, id: editingId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCompanies((current) => (editingId
        ? current.map((company) => company.id === editingId ? data.company : company)
        : [...current, data.company]).sort((a, b) => a.name.localeCompare(b.name)));
      setContacts((current) => current.map((contact) => contact.companyId === data.company.id ? { ...contact, companyName: data.company.name } : contact));
      setItems((current) => current.map((item) => item.companyId === data.company.id ? { ...item, company: data.company.name } : item));
      setCompanyForm({ name: "", document: "", segment: "", preferredPriceTable: "padrao" });
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
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contactForm,
          id: editingId,
          companyId: Number(contactForm.companyId),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setContacts((current) => (editingId
        ? current.map((contact) => contact.id === editingId ? data.contact : contact)
        : [...current, data.contact]).sort((a, b) => a.name.localeCompare(b.name)));
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
  async function createActivity(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/activities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...activityForm, opportunityId: Number(activityForm.opportunityId), dueAt: activityForm.dueAt || null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setActivities((current) => [data.activity, ...current]);
      setActivityForm({ opportunityId: "", type: "retorno", description: "", dueAt: "" });
      setDialog(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível cadastrar a atividade.");
    } finally { setSaving(false); }
  }
  async function toggleActivity(activity: ActivityRecord) {
    const completed = !activity.completedAt;
    const previous = activities;
    setActivities((current) => current.map((item) => item.id === activity.id ? { ...item, completedAt: completed ? new Date().toISOString() : null } : item));
    try {
      const response = await fetch("/api/activities", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: activity.id, completed }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
    } catch (reason) {
      setActivities(previous);
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a atividade.");
    }
  }
  async function deleteActivity(activity: ActivityRecord) {
    try {
      const response = await fetch(`/api/activities?id=${activity.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setActivities((current) => current.filter((item) => item.id !== activity.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível excluir a atividade.");
    }
  }
  async function createProposal(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const currentProposal = proposals.find((item) => item.id === editingProposalId);
      const response = await fetch("/api/proposals", { method: editingProposalId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...proposalForm, id: editingProposalId, status: currentProposal?.status ?? "rascunho", opportunityId: Number(proposalForm.opportunityId), discount: Number(proposalForm.discount), items: proposalForm.items.map((item) => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setProposals((current) => editingProposalId ? current.map((item) => item.id === editingProposalId ? data.proposal : item) : [data.proposal, ...current]); setDialog(null); setEditingProposalId(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível cadastrar a proposta."); }
    finally { setSaving(false); }
  }
  function editProposal(proposal: ProposalRecord) {
    setEditingProposalId(proposal.id);
    setProposalForm({ opportunityId: String(proposal.opportunityId), priceTable: proposal.priceTable ?? "padrao", validUntil: proposal.validUntil ?? "", discount: String(proposal.discount), notes: proposal.notes ?? "", items: proposal.items.map((item) => ({ catalogId:item.catalogId, category: item.category, description: item.description, quantity: item.quantity, unitCost:item.unitCost??0, unitPrice: item.unitPrice })) });
    setSelectedProposalId(null);
    setDialog("proposal");
  }
  async function saveCatalog(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { const response=await fetch("/api/catalog",{method:editingId?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...catalogForm,id:editingId,cost:Number(catalogForm.cost),competitivePrice:Number(catalogForm.competitivePrice),standardPrice:Number(catalogForm.standardPrice),valuePrice:Number(catalogForm.valuePrice)})}); const data=await response.json(); if(!response.ok)throw new Error(data.error); setCatalog(current=>(editingId?current.map(item=>item.id===editingId?data.item:item):[...current,data.item]).sort((a,b)=>a.description.localeCompare(b.description))); setDialog(null); setEditingId(null); }
    catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível salvar o item.");} finally{setSaving(false);}
  }
  function editCatalog(item: CatalogItem){setEditingId(item.id);setCatalogForm({category:item.category,code:item.code??"",description:item.description,unit:item.unit,cost:String(item.cost),competitivePrice:String(item.competitivePrice),standardPrice:String(item.standardPrice),valuePrice:String(item.valuePrice)});setDialog("catalog");}
  async function deleteCatalog(item: CatalogItem){if(!window.confirm(`Excluir “${item.description}”?`))return;const response=await fetch(`/api/catalog?id=${item.id}`,{method:"DELETE"});const data=await response.json();if(response.ok)setCatalog(current=>current.filter(currentItem=>currentItem.id!==item.id));else setError(data.error);}
  const catalogPrice=(item:CatalogItem,table:string)=>table==="competitiva"?item.competitivePrice:table==="valor"?item.valuePrice:item.standardPrice;
  function addCatalogItem(id:string){const item=catalog.find(entry=>entry.id===Number(id));if(!item)return;setProposalForm(current=>({...current,items:[...current.items.filter(entry=>entry.description||entry.unitPrice),{catalogId:item.id,category:item.category,description:item.description,quantity:1,unitCost:item.cost,unitPrice:catalogPrice(item,current.priceTable)}]}));}
  async function changeProposalStatus(id: number, status: string) {
    const previous = proposals; setProposals((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    try { const response = await fetch("/api/proposals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); }
    catch (reason) { setProposals(previous); setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a proposta."); }
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    setError("");
    try {
      const endpoint = deleteTarget.kind === "company" ? "companies" : deleteTarget.kind === "contact" ? "contacts" : "opportunities";
      const response = await fetch(`/api/${endpoint}?id=${deleteTarget.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (deleteTarget.kind === "company") setCompanies((current) => current.filter((item) => item.id !== deleteTarget.id));
      if (deleteTarget.kind === "contact") setContacts((current) => current.filter((item) => item.id !== deleteTarget.id));
      if (deleteTarget.kind === "opportunity") setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível excluir o cadastro.");
      setDeleteTarget(null);
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
    activities: [
      "CRM • AGENDA COMERCIAL",
      "Atividades",
      "Organize retornos, reuniões e próximos passos das oportunidades.",
    ],
    proposals: ["COMERCIAL • PROPOSTAS", "Propostas comerciais", "Monte valores de materiais e serviços vinculados às oportunidades."],
    catalog: ["COMERCIAL • CATÁLOGO", "Produtos, serviços e preços", "Controle custos e preços para diferentes estratégias comerciais."],
  };
  const primaryAction =
    view === "catalog" ? () => openNew("catalog") : view === "proposals"
      ? () => openNew("proposal")
      : view === "activities"
      ? () => openNew("activity")
      : view === "companies"
      ? () => openNew("company")
      : view === "contacts"
        ? () => openNew("contact")
        : () => openNew("opportunity");
  const primaryLabel =
    view === "catalog" ? "Novo item" : view === "proposals"
      ? "Nova proposta"
      : view === "activities"
      ? "Nova atividade"
      : view === "companies"
      ? "Nova empresa"
      : view === "contacts"
        ? "Novo contato"
        : "Nova oportunidade";
  const selectedOpportunity = items.find((item) => item.id === selectedOpportunityId) ?? null;
  const selectedActivities = selectedOpportunity ? activities.filter((activity) => activity.opportunityId === selectedOpportunity.id) : [];
  const selectedProposal = proposals.find((proposal) => proposal.id === selectedProposalId) ?? null;
  const proposalCost = proposalForm.items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unitCost||0),0);
  const proposalNet = Math.max(0,proposalForm.items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unitPrice||0),0)-Number(proposalForm.discount||0));
  const proposalProfit = proposalNet-proposalCost;
  const proposalMargin = proposalNet ? proposalProfit/proposalNet*100 : 0;

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
          <NavButton active={view === "activities"} onClick={() => navigate("activities")} icon={<CalendarClock />}>
            Atividades <span className="nav-count">{activities.filter((item) => !item.completedAt).length}</span>
          </NavButton>
          <NavButton icon={<Target />}>Metas</NavButton>
          <p>GESTÃO</p>
          <NavButton active={view === "proposals"} onClick={() => navigate("proposals")} icon={<CircleDollarSign />}>
            Propostas <span className="nav-count">{proposals.length}</span>
          </NavButton>
          <NavButton active={view === "catalog"} onClick={() => navigate("catalog")} icon={<PackageOpen />}>
            Produtos e serviços <span className="nav-count">{catalog.length}</span>
          </NavButton>
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
              add={() => openNew("opportunity")}
              edit={editOpportunity}
              inspect={(item) => setSelectedOpportunityId(item.id)}
              remove={(item) => setDeleteTarget({ kind: "opportunity", id: item.id, name: item.title })}
            />
          ) : view === "catalog" ? (
            <Catalog catalog={catalog} add={() => openNew("catalog")} edit={editCatalog} remove={deleteCatalog} />
          ) : view === "proposals" ? (
            <Proposals proposals={proposals} add={() => openNew("proposal")} inspect={(proposal) => setSelectedProposalId(proposal.id)} changeStatus={changeProposalStatus} />
          ) : view === "activities" ? (
            <Activities activities={activities} add={() => openNew("activity")} toggle={toggleActivity} remove={deleteActivity} />
          ) : view === "companies" ? (
            <Companies
              companies={filteredCompanies}
              contacts={contacts}
              opportunities={items}
              add={() => openNew("company")}
              edit={editCompany}
              remove={(company) => setDeleteTarget({ kind: "company", id: company.id, name: company.name })}
            />
          ) : (
            <Contacts
              contacts={filteredContacts}
              add={() => openNew("contact")}
              edit={editContact}
              remove={(contact) => setDeleteTarget({ kind: "contact", id: contact.id, name: contact.name })}
            />
          )}
        </div>
      </main>

      <Sheet open={Boolean(selectedProposal)} onOpenChange={(open) => { if (!open) setSelectedProposalId(null); }}>
        <SheetContent className="opportunity-sheet proposal-sheet">
          {selectedProposal && <><SheetHeader className="opportunity-sheet-head"><span className="dialog-kicker">PROPOSTA COMERCIAL</span><SheetTitle>{selectedProposal.number}</SheetTitle><SheetDescription>{selectedProposal.companyName} · {selectedProposal.opportunityTitle}</SheetDescription></SheetHeader><div className="opportunity-sheet-body"><div className="opportunity-value"><span>Valor total</span><strong>{money(selectedProposal.total)}</strong></div><div className="proposal-view-meta"><span>Status<strong>{selectedProposal.status}</strong></span><span>Validade<strong>{selectedProposal.validUntil ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${selectedProposal.validUntil}T12:00:00Z`)) : "Não informada"}</strong></span><span>Subtotal<strong>{money(selectedProposal.subtotal)}</strong></span><span>Desconto<strong>{money(selectedProposal.discount)}</strong></span><span>Custo total<strong>{money(selectedProposal.items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unitCost||0),0))}</strong></span><span>Margem<strong>{selectedProposal.total?(((selectedProposal.total-selectedProposal.items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unitCost||0),0))/selectedProposal.total)*100).toFixed(1):"0.0"}%</strong></span></div><div className="sheet-actions"><Button onClick={() => editProposal(selectedProposal)}><Pencil /> Editar proposta</Button><Button variant="outline" onClick={() => { window.location.href = `/proposta?id=${selectedProposal.id}`; }}><Printer /> Gerar PDF</Button></div><section className="proposal-view-items"><h3>Itens da proposta</h3>{selectedProposal.items.map((item, index) => <article key={item.id ?? index}><div><span>{item.category === "material" ? "Material" : "Serviço"}</span><strong>{item.description}</strong><small>{Number(item.quantity)} × {money(Number(item.unitPrice))}</small></div><b>{money(Number(item.total ?? Number(item.quantity) * Number(item.unitPrice)))}</b></article>)}</section>{selectedProposal.notes && <div className="proposal-view-notes"><span>Observações</span><p>{selectedProposal.notes}</p></div>}</div></>}
        </SheetContent>
      </Sheet>
      <Sheet open={Boolean(selectedOpportunity)} onOpenChange={(open) => { if (!open) setSelectedOpportunityId(null); }}>
        <SheetContent className="opportunity-sheet">
          {selectedOpportunity && <>
            <SheetHeader className="opportunity-sheet-head">
              <span className="dialog-kicker">DETALHES DA OPORTUNIDADE</span>
              <SheetTitle>{selectedOpportunity.title}</SheetTitle>
              <SheetDescription>{selectedOpportunity.company}</SheetDescription>
            </SheetHeader>
            <div className="opportunity-sheet-body">
              <div className="opportunity-value"><span>Valor estimado</span><strong>{money(selectedOpportunity.value)}</strong></div>
              <div className="opportunity-facts">
                <div><span>Etapa atual</span><strong>{stages.find((stage) => stage.id === selectedOpportunity.stage)?.label ?? selectedOpportunity.stage}</strong></div>
                <div><span>Probabilidade</span><strong>{selectedOpportunity.probability}%</strong></div>
                <div><span>Temperatura</span><strong>{selectedOpportunity.temperature === "hot" ? "Alta" : selectedOpportunity.temperature === "warm" ? "Média" : "Baixa"}</strong></div>
                <div><span>Fechamento previsto</span><strong>{selectedOpportunity.due}</strong></div>
              </div>
              <div className="probability-bar"><span style={{ width: `${selectedOpportunity.probability}%` }} /></div>
              <div className="sheet-actions">
                <Button onClick={() => { setSelectedOpportunityId(null); editOpportunity(selectedOpportunity); }}><Pencil /> Editar oportunidade</Button>
                <Button variant="outline" onClick={() => { setSelectedOpportunityId(null); setActivityForm({ opportunityId: String(selectedOpportunity.id), type: "retorno", description: "", dueAt: "" }); setDialog("activity"); }}><Plus /> Nova atividade</Button>
              </div>
              <section className="opportunity-history">
                <div className="history-head"><h3>Histórico de atividades</h3><span>{selectedActivities.length}</span></div>
                {selectedActivities.length ? selectedActivities.map((activity) => <article key={activity.id} className={activity.completedAt ? "done" : ""}><i /><div><strong>{activity.description}</strong><span>{activity.dueAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(activity.dueAt)) : "Sem prazo"}</span></div><small>{activity.completedAt ? "Concluída" : "Pendente"}</small></article>) : <p>Nenhuma atividade registrada para esta oportunidade.</p>}
              </section>
            </div>
          </>}
        </SheetContent>
      </Sheet>

      <Dialog
        open={dialog === "opportunity"}
        onOpenChange={(open) => { setDialog(open ? "opportunity" : null); if (!open) setEditingId(null); }}
      >
        <DialogContent className="dialog">
          <DialogHeader>
            <span className="dialog-kicker">CADASTRO COMERCIAL</span>
            <DialogTitle>{editingId ? "Editar oportunidade" : "Nova oportunidade"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Atualize os dados comerciais desta oportunidade." : "Registre uma oportunidade e vincule-a à empresa responsável."}
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
            <div className="form-split">
              <Field label="Probabilidade de fechamento">
                <select value={opportunityForm.probability} onChange={(event) => setOpportunityForm({ ...opportunityForm, probability: event.target.value })}>
                  <option value="10">10%</option><option value="25">25%</option><option value="50">50%</option><option value="75">75%</option><option value="90">90%</option><option value="100">100%</option>
                </select>
              </Field>
              <Field label="Temperatura comercial">
                <select value={opportunityForm.temperature} onChange={(event) => setOpportunityForm({ ...opportunityForm, temperature: event.target.value as "cold" | "warm" | "hot" })}>
                  <option value="cold">Baixa</option><option value="warm">Média</option><option value="hot">Alta</option>
                </select>
              </Field>
            </div>
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
              {editingId ? "Salvar alterações" : "Cadastrar oportunidade"}
            </SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "company"}
        onOpenChange={(open) => { setDialog(open ? "company" : null); if (!open) setEditingId(null); }}
      >
        <DialogContent className="dialog">
          <DialogHeader>
            <span className="dialog-kicker">CARTEIRA DE CLIENTES</span>
            <DialogTitle>{editingId ? "Editar empresa" : "Nova empresa"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Atualize os dados principais desta empresa." : "Cadastre os dados principais do cliente ou prospect."}
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
            <Field label="Tabela de preços preferencial">
              <select value={companyForm.preferredPriceTable} onChange={(event) => setCompanyForm({ ...companyForm, preferredPriceTable: event.target.value })}>
                <option value="competitiva">Competitiva</option><option value="padrao">Padrão</option><option value="valor">Valor agregado</option>
              </select>
              <small>Será selecionada automaticamente nas novas propostas deste cliente.</small>
            </Field>
            <SaveButton saving={saving}>{editingId ? "Salvar alterações" : "Cadastrar empresa"}</SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "contact"}
        onOpenChange={(open) => { setDialog(open ? "contact" : null); if (!open) setEditingId(null); }}
      >
        <DialogContent className="dialog">
          <DialogHeader>
            <span className="dialog-kicker">RELACIONAMENTO</span>
            <DialogTitle>{editingId ? "Editar contato" : "Novo contato"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Atualize os dados e o vínculo deste contato." : "Associe uma pessoa de contato à empresa correspondente."}
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
              {editingId ? "Salvar alterações" : "Cadastrar contato"}
            </SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "activity"} onOpenChange={(open) => setDialog(open ? "activity" : null)}>
        <DialogContent className="dialog">
          <DialogHeader>
            <span className="dialog-kicker">AGENDA COMERCIAL</span>
            <DialogTitle>Nova atividade</DialogTitle>
            <DialogDescription>Registre o próximo passo de uma oportunidade.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createActivity} className="form">
            <Field label="Oportunidade">
              <select value={activityForm.opportunityId} onChange={(event) => setActivityForm({ ...activityForm, opportunityId: event.target.value })} required>
                <option value="">Selecione uma oportunidade</option>
                {items.filter((item) => item.stage !== "ganho").map((item) => <option key={item.id} value={item.id}>{item.title} — {item.company}</option>)}
              </select>
            </Field>
            <Field label="Tipo de atividade">
              <select value={activityForm.type} onChange={(event) => setActivityForm({ ...activityForm, type: event.target.value })}>
                <option value="retorno">Retorno ao cliente</option><option value="ligacao">Ligação</option><option value="reuniao">Reunião</option><option value="visita">Visita técnica</option><option value="proposta">Envio de proposta</option><option value="outro">Outro</option>
              </select>
            </Field>
            <Field label="Descrição">
              <Textarea value={activityForm.description} onChange={(event) => setActivityForm({ ...activityForm, description: event.target.value })} placeholder="Ex.: Confirmar escopo e agendar apresentação" required />
            </Field>
            <Field label="Prazo">
              <Input type="datetime-local" value={activityForm.dueAt} onChange={(event) => setActivityForm({ ...activityForm, dueAt: event.target.value })} />
            </Field>
            <SaveButton saving={saving} disabled={!items.some((item) => item.stage !== "ganho")}>Cadastrar atividade</SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "proposal"} onOpenChange={(open) => { setDialog(open ? "proposal" : null); if (!open) setEditingProposalId(null); }}>
        <DialogContent className="dialog proposal-dialog">
          <DialogHeader><span className="dialog-kicker">PROPOSTA COMERCIAL</span><DialogTitle>{editingProposalId ? "Editar proposta" : "Nova proposta"}</DialogTitle><DialogDescription>{editingProposalId ? "Atualize os itens, valores e condições comerciais." : "Componha materiais, serviços e condições comerciais."}</DialogDescription></DialogHeader>
          <form onSubmit={createProposal} className="form proposal-form">
            <div className="proposal-top"><Field label="Oportunidade"><select value={proposalForm.opportunityId} onChange={(event) => { const opportunity=items.find(item=>item.id===Number(event.target.value)); const company=companies.find(entry=>entry.id===opportunity?.companyId); const priceTable=company?.preferredPriceTable??proposalForm.priceTable; setProposalForm(current=>({...current,opportunityId:event.target.value,priceTable,items:current.items.map(entry=>{const catalogItem=catalog.find(item=>item.id===entry.catalogId);return catalogItem?{...entry,unitPrice:catalogPrice(catalogItem,priceTable)}:entry;})})); }} required><option value="">Selecione</option>{items.map((item) => <option key={item.id} value={item.id}>{item.title} — {item.company}</option>)}</select></Field><Field label="Tabela de preços"><select value={proposalForm.priceTable} onChange={(event) => {const priceTable=event.target.value;setProposalForm(current=>({...current,priceTable,items:current.items.map(entry=>{const catalogItem=catalog.find(item=>item.id===entry.catalogId);return catalogItem?{...entry,unitPrice:catalogPrice(catalogItem,priceTable)}:entry;})}));}}><option value="competitiva">Competitiva</option><option value="padrao">Padrão</option><option value="valor">Valor agregado</option></select></Field><Field label="Validade"><Input type="date" value={proposalForm.validUntil} onChange={(event) => setProposalForm({ ...proposalForm, validUntil: event.target.value })} /></Field></div>
            <div className="proposal-items-head"><strong>Itens da proposta</strong><button type="button" onClick={() => setProposalForm({ ...proposalForm, items: [...proposalForm.items, { category: "material", description: "", quantity: 1, unitCost: "", unitPrice: "" }] })}><Plus /> Adicionar item</button></div>
            {catalog.length ? <Field label="Selecionar do catálogo"><select defaultValue="" onChange={(event)=>{addCatalogItem(event.target.value);event.target.value="";}}><option value="">Escolha um produto ou serviço...</option>{catalog.map(item=><option key={item.id} value={item.id}>{item.category==="material"?"Material":"Serviço"} · {item.description} · {money(catalogPrice(item,proposalForm.priceTable))}</option>)}</select></Field>:null}
            <div className="proposal-items">{proposalForm.items.map((item, index) => <div className="proposal-item" key={index}><select value={item.category} aria-label="Categoria" onChange={(event) => { const next = [...proposalForm.items]; next[index] = { ...item, category: event.target.value as "material" | "servico" }; setProposalForm({ ...proposalForm, items: next }); }}><option value="material">Material</option><option value="servico">Serviço</option></select><Input value={item.description} aria-label="Descrição" placeholder="Descrição do item" onChange={(event) => { const next = [...proposalForm.items]; next[index] = { ...item, description: event.target.value }; setProposalForm({ ...proposalForm, items: next }); }} /><Input type="number" min="0.01" step="0.01" value={item.quantity} aria-label="Quantidade" placeholder="Qtd." onChange={(event) => { const next = [...proposalForm.items]; next[index] = { ...item, quantity: event.target.value }; setProposalForm({ ...proposalForm, items: next }); }} /><Input type="number" min="0" step="0.01" value={item.unitCost} aria-label="Custo unitário" placeholder="Custo unit." onChange={(event) => { const next = [...proposalForm.items]; next[index] = { ...item, unitCost: event.target.value }; setProposalForm({ ...proposalForm, items: next }); }} /><Input type="number" min="0" step="0.01" value={item.unitPrice} aria-label="Valor unitário" placeholder="Valor unit." onChange={(event) => { const next = [...proposalForm.items]; next[index] = { ...item, unitPrice: event.target.value }; setProposalForm({ ...proposalForm, items: next }); }} /><strong>{money(Number(item.quantity) * Number(item.unitPrice || 0))}</strong><button type="button" aria-label="Remover item" disabled={proposalForm.items.length === 1} onClick={() => setProposalForm({ ...proposalForm, items: proposalForm.items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 /></button></div>)}</div>
            <div className="proposal-bottom"><Field label="Observações"><Textarea value={proposalForm.notes} onChange={(event) => setProposalForm({ ...proposalForm, notes: event.target.value })} placeholder="Condições, prazo de entrega ou escopo" /></Field><div><Field label="Desconto (R$)"><Input type="number" min="0" step="0.01" value={proposalForm.discount} onChange={(event) => setProposalForm({ ...proposalForm, discount: event.target.value })} /></Field><div className="proposal-total"><span>Total</span><strong>{money(proposalNet)}</strong></div><div className={`proposal-margin ${proposalProfit<0?"danger":proposalMargin<10?"warning":""}`}><span>Custo total <strong>{money(proposalCost)}</strong></span><span>Resultado <strong>{money(proposalProfit)}</strong></span><b>Margem <strong>{proposalMargin.toFixed(1)}%</strong></b>{proposalProfit<0&&<small>Alerta: proposta abaixo do custo</small>}</div></div></div>
            <SaveButton saving={saving} disabled={!items.length}>{editingProposalId ? "Salvar alterações" : "Criar proposta"}</SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "catalog"} onOpenChange={(open)=>{setDialog(open?"catalog":null);if(!open)setEditingId(null);}}>
        <DialogContent className="dialog catalog-dialog"><DialogHeader><span className="dialog-kicker">CATÁLOGO COMERCIAL</span><DialogTitle>{editingId?"Editar item":"Novo produto ou serviço"}</DialogTitle><DialogDescription>Cadastre o custo e os preços de cada estratégia comercial.</DialogDescription></DialogHeader>
          <form className="form" onSubmit={saveCatalog}><div className="form-split"><Field label="Tipo"><select value={catalogForm.category} onChange={event=>setCatalogForm({...catalogForm,category:event.target.value as "material"|"servico"})}><option value="material">Material</option><option value="servico">Serviço</option></select></Field><Field label="Código"><Input value={catalogForm.code} onChange={event=>setCatalogForm({...catalogForm,code:event.target.value})} placeholder="Ex.: MAT-001" /></Field></div><Field label="Descrição"><Input value={catalogForm.description} onChange={event=>setCatalogForm({...catalogForm,description:event.target.value})} required placeholder="Nome do produto ou serviço" /></Field><div className="form-split"><Field label="Unidade"><Input value={catalogForm.unit} onChange={event=>setCatalogForm({...catalogForm,unit:event.target.value})} /></Field><Field label="Custo (R$)"><Input type="number" min="0" step="0.01" value={catalogForm.cost} onChange={event=>setCatalogForm({...catalogForm,cost:event.target.value})} /></Field></div><div className="catalog-price-fields"><Field label="Competitiva"><Input type="number" min="0" step="0.01" value={catalogForm.competitivePrice} onChange={event=>setCatalogForm({...catalogForm,competitivePrice:event.target.value})} required /></Field><Field label="Padrão"><Input type="number" min="0" step="0.01" value={catalogForm.standardPrice} onChange={event=>setCatalogForm({...catalogForm,standardPrice:event.target.value})} required /></Field><Field label="Valor agregado"><Input type="number" min="0" step="0.01" value={catalogForm.valuePrice} onChange={event=>setCatalogForm({...catalogForm,valuePrice:event.target.value})} required /></Field></div><SaveButton saving={saving}>{editingId?"Salvar alterações":"Cadastrar item"}</SaveButton></form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `“${deleteTarget.name}” será removido permanentemente. Esta ação não pode ser desfeita.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="delete-button" onClick={confirmDelete} disabled={saving}>
              {saving ? "Excluindo..." : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  edit,
  inspect,
  remove,
}: {
  items: Opportunity[];
  drag: (id: number) => void;
  move: (stage: string) => void;
  add: () => void;
  edit: (item: Opportunity) => void;
  inspect: (item: Opportunity) => void;
  remove: (item: Opportunity) => void;
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
                    onClick={() => inspect(card)}
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
                      <span className="record-actions">
                        <button aria-label={`Editar ${card.title}`} onClick={(event) => { event.stopPropagation(); edit(card); }}><Pencil /></button>
                        <button className="danger" aria-label={`Excluir ${card.title}`} onClick={(event) => { event.stopPropagation(); remove(card); }}><Trash2 /></button>
                      </span>
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
  edit,
  remove,
}: {
  companies: Company[];
  contacts: ContactRecord[];
  opportunities: Opportunity[];
  add: () => void;
  edit: (company: Company) => void;
  remove: (company: Company) => void;
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
              <div className="company-meta">
                <small>{company.segment || "Segmento não informado"}</small>
                <span className="record-actions">
                  <button aria-label={`Editar ${company.name}`} onClick={() => edit(company)}><Pencil /></button>
                  <button className="danger" aria-label={`Excluir ${company.name}`} onClick={() => remove(company)}><Trash2 /></button>
                </span>
              </div>
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
  edit,
  remove,
}: {
  contacts: ContactRecord[];
  add: () => void;
  edit: (contact: ContactRecord) => void;
  remove: (contact: ContactRecord) => void;
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
        <span>Ações</span>
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
          <span className="record-actions">
            <button aria-label={`Editar ${contact.name}`} onClick={() => edit(contact)}><Pencil /></button>
            <button className="danger" aria-label={`Excluir ${contact.name}`} onClick={() => remove(contact)}><Trash2 /></button>
          </span>
        </div>
      ))}
    </div>
  );
}
function Catalog({catalog,add,edit,remove}:{catalog:CatalogItem[];add:()=>void;edit:(item:CatalogItem)=>void;remove:(item:CatalogItem)=>void}){
  if(!catalog.length)return <Empty icon={<PackageOpen/>} title="Catálogo vazio" text="Cadastre produtos e serviços com custos e três níveis de preço." action="Cadastrar item" onClick={add}/>;
  const margin=(price:number,cost:number)=>price?Math.round((price-cost)/price*100):0;
  return <div className="catalog-list"><div className="catalog-table-head"><span>Item</span><span>Custo</span><span>Competitiva</span><span>Padrão</span><span>Valor agregado</span><span/></div>{catalog.map(item=><article className="catalog-row" key={item.id}><div><small>{item.category==="material"?"Material":"Serviço"}{item.code?` · ${item.code}`:""}</small><strong>{item.description}</strong><em>por {item.unit}</em></div><span>{money(item.cost)}</span><span><strong>{money(item.competitivePrice)}</strong><small>{margin(item.competitivePrice,item.cost)}% margem</small></span><span><strong>{money(item.standardPrice)}</strong><small>{margin(item.standardPrice,item.cost)}% margem</small></span><span><strong>{money(item.valuePrice)}</strong><small>{margin(item.valuePrice,item.cost)}% margem</small></span><div className="record-actions"><button aria-label={`Editar ${item.description}`} onClick={()=>edit(item)}><Pencil/></button><button className="danger" aria-label={`Excluir ${item.description}`} onClick={()=>remove(item)}><Trash2/></button></div></article>)}</div>;
}
function Proposals({ proposals, add, inspect, changeStatus }: { proposals: ProposalRecord[]; add: () => void; inspect: (proposal: ProposalRecord) => void; changeStatus: (id: number, status: string) => void }) {
  const labels: Record<string, string> = { rascunho: "Rascunho", enviada: "Enviada", aprovada: "Aprovada", recusada: "Recusada", expirada: "Expirada" };
  if (!proposals.length) return <Empty icon={<FileText />} title="Nenhuma proposta cadastrada" text="Crie uma proposta com materiais e serviços vinculada a uma oportunidade." action="Criar proposta" onClick={add} />;
  return <div className="proposal-grid">{proposals.map((proposal) => <article className="proposal-card" key={proposal.id} onClick={() => inspect(proposal)}><div className="proposal-card-head"><span><FileText /></span><div><small>{proposal.number}</small><h2>{proposal.companyName}</h2></div><select value={proposal.status} aria-label="Status da proposta" onClick={(event) => event.stopPropagation()} onChange={(event) => changeStatus(proposal.id, event.target.value)}><option value="rascunho">Rascunho</option><option value="enviada">Enviada</option><option value="aprovada">Aprovada</option><option value="recusada">Recusada</option><option value="expirada">Expirada</option></select></div><p>{proposal.opportunityTitle}</p><div className="proposal-breakdown"><span>Materiais <strong>{money(proposal.items.filter((item) => item.category === "material").reduce((sum, item) => sum + Number(item.total ?? 0), 0))}</strong></span><span>Serviços <strong>{money(proposal.items.filter((item) => item.category === "servico").reduce((sum, item) => sum + Number(item.total ?? 0), 0))}</strong></span></div><div className="proposal-card-total"><span>{labels[proposal.status]}</span><div><small>{proposal.discount ? `Desconto: ${money(proposal.discount)}` : "Sem desconto"}</small><strong>{money(proposal.total)}</strong></div></div></article>)}</div>;
}
function Activities({ activities, add, toggle, remove }: { activities: ActivityRecord[]; add: () => void; toggle: (activity: ActivityRecord) => void; remove: (activity: ActivityRecord) => void }) {
  const typeLabels: Record<string, string> = { ligacao: "Ligação", reuniao: "Reunião", visita: "Visita técnica", proposta: "Envio de proposta", retorno: "Retorno", outro: "Outro" };
  if (!activities.length) return <Empty icon={<CalendarClock />} title="Nenhuma atividade cadastrada" text="Registre o próximo passo de uma oportunidade para organizar sua rotina comercial." action="Cadastrar atividade" onClick={add} />;
  const sorted = [...activities].sort((a, b) => Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) || String(a.dueAt ?? "9999").localeCompare(String(b.dueAt ?? "9999")));
  return (
    <div className="activity-list">
      <div className="activity-summary"><strong>{activities.filter((item) => !item.completedAt).length}</strong><span>atividades pendentes</span><i /><strong>{activities.filter((item) => item.completedAt).length}</strong><span>concluídas</span></div>
      {sorted.map((activity) => {
        const overdue = Boolean(activity.dueAt && !activity.completedAt && new Date(activity.dueAt) < new Date());
        return <article className={`activity-card ${activity.completedAt ? "completed" : ""}`} key={activity.id}>
          <button className="activity-check" onClick={() => toggle(activity)} aria-label={activity.completedAt ? "Reabrir atividade" : "Concluir atividade"}><CheckCircle2 /></button>
          <div className="activity-main"><div className="activity-tags"><span>{typeLabels[activity.type] ?? activity.type}</span>{overdue && <b>Atrasada</b>}</div><h3>{activity.description}</h3><p><Building2 /> {activity.companyName} · {activity.opportunityTitle}</p></div>
          <div className="activity-side"><span className="activity-date"><CalendarClock />{activity.dueAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(activity.dueAt)) : "Sem prazo"}</span><button className="activity-delete" onClick={() => remove(activity)} aria-label="Excluir atividade"><Trash2 /></button></div>
        </article>;
      })}
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
