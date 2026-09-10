"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Contact,
  Download,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  Loader2,
  Mail,
  Menu,
  MoreHorizontal,
  PackageOpen,
  Paperclip,
  ShoppingCart,
  Pencil,
  Phone,
  Plus,
  Printer,
  Search,
  ReceiptText,
  Settings,
  Target,
  TrendingUp,
  Trash2,
  Wrench,
  Upload,
  Users,
  WalletCards,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type View =
  | "dashboard"
  | "pipeline"
  | "companies"
  | "contacts"
  | "activities"
  | "goals"
  | "proposals"
  | "catalog"
  | "equipment"
  | "sales"
  | "projects"
  | "service_calls"
  | "billings"
  | "receivables"
  | "payables"
  | "team"
  | "reports"
  | "settings";
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
  createdAt: string;
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
  createdAt: string;
};
type Company = {
  id: number;
  name: string;
  document: string | null;
  segment: string | null;
  preferredPriceTable: string;
  isClient: boolean;
  isServiceTaker: boolean;
  isServiceLocation: boolean;
  logoStorageKey: string | null;
  logoContentType: string | null;
  logoName: string | null;
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
type ProposalItem = {
  id?: number;
  proposalId?: number;
  catalogId?: number;
  category: "material" | "servico";
  description: string;
  quantity: number | string;
  unitCost: number | string;
  unitPrice: number | string;
  total?: number;
};
type ProposalRecord = {
  id: number;
  opportunityId: number | null;
  companyId: number | null;
  opportunityTitle: string;
  companyName: string;
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
  items: ProposalItem[];
};
type CatalogCategory = "material" | "servico" | "equipamento";
type CatalogItem = {
  id: number;
  category: CatalogCategory;
  code: string | null;
  description: string;
  unit: string;
  cost: number;
  competitivePrice: number;
  standardPrice: number;
  valuePrice: number;
  active: boolean;
};
type EquipmentCatalogItem = {
  id: number;
  code: string | null;
  description: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  inventoryNumber: string | null;
  unit: string;
  cost: number;
  active: boolean;
};
type SaleRecord = {
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
  updatedAt: string;
  items: ProposalItem[];
};
type BillingRecord = {
  id: number;
  saleId: number;
  number: string;
  saleNumber: string;
  companyName: string;
  status: string;
  paymentTerms: string;
  installments: number;
  dueDate: string | null;
  materialInvoice: string | null;
  serviceInvoice: string | null;
  materialAmount: number;
  serviceAmount: number;
  total: number;
  receivedAmount: number;
  createdAt: string;
};
type ReceivableRecord = {
  id: number;
  billingId: number;
  billingNumber: string;
  companyName: string;
  installmentNumber: number;
  amount: number;
  dueDate: string;
  receivedAmount: number;
  paymentDate: string | null;
  interest: number;
  penalty: number;
  discount: number;
  status: string;
  updatedAt: string;
};
type SupplierRecord = {
  id: number;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
};
type PayableRecord = {
  id: number;
  supplierId: number;
  supplierName: string;
  companyId: number | null;
  companyName: string | null;
  project: string | null;
  groupNumber: string;
  reference: string | null;
  description: string;
  category: string;
  installmentNumber: number;
  installmentCount: number;
  amount: number;
  dueDate: string;
  paidAmount: number;
  paymentDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};
type TeamMember = {
  id: number;
  email: string;
  name: string;
  jobTitle: string | null;
  role: string;
  permissions: string[];
  active: boolean;
  createdAt: string;
};
type SystemSettings = {
  id: number;
  companyName: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  defaultPriceTable: string;
  proposalValidityDays: number;
  defaultPaymentTerms: string;
  defaultInstallments: number;
  defaultDueDays: number;
  proposalNotes: string | null;
  updatedAt: string;
};
type GoalRecord = {
  id: number;
  name: string;
  type: string;
  target: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
type ProjectTask = {
  id: number;
  saleId: number;
  title: string;
  responsible: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
type ServiceCall = {
  id: number;
  number: string;
  companyId: number | null;
  serviceTakerCompanyId: number | null;
  companyName: string;
  serviceTaker: string | null;
  requestOrigin: string | null;
  department: string | null;
  customerTicket: string | null;
  saleId: number | null;
  location: string | null;
  locationId: number | null;
  locationCompanyId: number | null;
  contactName: string | null;
  technician: string | null;
  serviceType: string;
  priority: string;
  scheduledAt: string | null;
  status: string;
  subject: string;
  description: string;
  executedService: string | null;
  consumablesUsed: boolean;
  consumablesDescription: string | null;
  partsReplaced: boolean;
  partsDescription: string | null;
  expensesAmount: number;
  expensesDescription: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
type ServiceCallHistory = {
  id: number;
  serviceCallId: number;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string;
  createdAt: string;
};
type ServiceCallFile = {
  id: number;
  serviceCallId: number;
  name: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
};
type ServiceLocation = {
  id: number;
  companyId: number;
  name: string;
  address: string;
  active: boolean;
};
type ServiceEntry = {
  id: number;
  catalogId?: number | null;
  description: string;
  quantity: number;
  unit?: string;
  technician?: string | null;
  notes?: string | null;
};
type MaterialEntry = ServiceEntry & {
  catalogId?: number | null;
  unitCost: number;
  unitPrice: number;
  priceTable: string;
};
type EquipmentEntry = ServiceEntry & {
  equipmentItemId?: number | null;
  brandModel?: string | null;
  removedSerial?: string | null;
  installedSerial?: string | null;
  reason?: string | null;
};
type ExpenseEntry = {
  id: number;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
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
const catalogCategoryLabel = (category: CatalogCategory) =>
  category === "material"
    ? "Material"
    : category === "equipamento"
      ? "Equipamento / peça"
      : "Serviço";
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
  createdAt: item.createdAt,
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
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentCatalogItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [billings, setBillings] = useState<BillingRecord[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRecord[]>([]);
  const [payables, setPayables] = useState<PayableRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [serviceCalls, setServiceCalls] = useState<ServiceCall[]>([]);
  const [serviceCallHistory, setServiceCallHistory] = useState<
    ServiceCallHistory[]
  >([]);
  const [serviceCallFiles, setServiceCallFiles] = useState<ServiceCallFile[]>(
    [],
  );
  const [serviceLocations, setServiceLocations] = useState<ServiceLocation[]>(
    [],
  );
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dialog, setDialog] = useState<
    | "opportunity"
    | "company"
    | "contact"
    | "activity"
    | "goal"
    | "proposal"
    | "catalog"
    | "equipment"
    | "payable"
    | "member"
    | "service_call"
    | null
  >(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "company" | "contact" | "opportunity";
    id: number;
    name: string;
  } | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<
    number | null
  >(null);
  const [selectedProposalId, setSelectedProposalId] = useState<number | null>(
    null,
  );
  const [selectedServiceCallId, setSelectedServiceCallId] = useState<
    number | null
  >(null);
  const [editingProposalId, setEditingProposalId] = useState<number | null>(
    null,
  );
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
    isClient: true,
    isServiceTaker: false,
    isServiceLocation: false,
  });
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [contactForm, setContactForm] = useState({
    name: "",
    companyId: "",
    role: "",
    email: "",
    phone: "",
  });
  const [activityForm, setActivityForm] = useState({
    opportunityId: "",
    type: "retorno",
    description: "",
    dueAt: "",
  });
  const [proposalForm, setProposalForm] = useState<{
    opportunityId: string;
    companyId: string;
    customerOrder: string;
    requester: string;
    priceTable: string;
    validUntil: string;
    discount: string;
    notes: string;
    items: ProposalItem[];
  }>({
    opportunityId: "",
    companyId: "",
    customerOrder: "",
    requester: "",
    priceTable: "padrao",
    validUntil: "",
    discount: "0",
    notes: "",
    items: [
      {
        category: "servico",
        description: "",
        quantity: 1,
        unitCost: "",
        unitPrice: "",
      },
    ],
  });
  const [catalogForm, setCatalogForm] = useState({
    category: "material" as CatalogCategory,
    code: "",
    description: "",
    unit: "un",
    cost: "",
    competitivePrice: "",
    standardPrice: "",
    valuePrice: "",
  });
  const [equipmentForm, setEquipmentForm] = useState({
    code: "", description: "", brand: "", model: "", serialNumber: "", inventoryNumber: "", unit: "un", cost: "",
  });
  const [payableForm, setPayableForm] = useState({
    supplierName: "",
    supplierDocument: "",
    supplierEmail: "",
    supplierPhone: "",
    companyId: "",
    project: "",
    description: "",
    reference: "",
    category: "fornecedor",
    amount: "",
    installments: "1",
    dueDate: "",
  });
  const [memberForm, setMemberForm] = useState({
    name: "",
    email: "",
    jobTitle: "",
    role: "seller",
    permissions: ["crm", "proposals", "sales"] as string[],
    active: true,
  });
  const [goalForm, setGoalForm] = useState({
    name: "",
    type: "sales",
    target: "",
    startsAt: `${new Date().getFullYear()}-01-01`,
    endsAt: `${new Date().getFullYear()}-12-31`,
    active: true,
  });
  const [serviceCallForm, setServiceCallForm] = useState({
    number: "",
    companyId: "",
    companyName: "",
    serviceTakerCompanyId: "",
    serviceTaker: "",
    requestOrigin: "telefone",
    department: "",
    customerTicket: "",
    saleId: "",
    location: "",
    locationId: "",
    locationCompanyId: "",
    contactName: "",
    technician: "",
    serviceType: "visita",
    priority: "normal",
    scheduledAt: "",
    subject: "",
    description: "",
    executedService: "",
    consumablesUsed: false,
    consumablesDescription: "",
    partsReplaced: false,
    partsDescription: "",
    expensesAmount: "0",
    expensesDescription: "",
  });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const responses = await Promise.all(
          [
            "/api/opportunities",
            "/api/companies",
            "/api/contacts",
            "/api/activities",
            "/api/proposals",
            "/api/catalog",
            "/api/equipment",
            "/api/sales",
            "/api/billings",
            "/api/receivables",
            "/api/payables",
            "/api/team",
            "/api/settings",
            "/api/goals",
            "/api/project-tasks",
            "/api/project-files",
            "/api/service-calls",
            "/api/service-call-files",
            "/api/service-locations",
          ].map((url) => fetch(url, { cache: "no-store" })),
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
          setEquipmentCatalog(payloads[6].equipment);
          setSales(payloads[7].sales);
          setBillings(payloads[8].billings);
          setReceivables(payloads[9].receivables);
          setPayables(payloads[10].payables);
          setSuppliers(payloads[10].suppliers);
          setTeam(payloads[11].team);
          setCurrentUserId(payloads[11].currentUserId);
          setSettings(payloads[12].settings);
          setGoals(payloads[13].goals);
          setProjectTasks(payloads[14].tasks);
          setProjectFiles(payloads[15].files);
          setServiceCalls(payloads[16].calls);
          setServiceCallHistory(payloads[16].history);
          setServiceCallFiles(payloads[17].files);
          setServiceLocations(payloads[18].locations);
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
  const currentMember =
    team.find((member) => member.id === currentUserId) ?? null;
  const can = (permission: string) =>
    currentMember?.role === "admin" ||
    Boolean(
      currentMember?.active && currentMember?.permissions.includes(permission),
    );
  useEffect(() => {
    if (!currentMember || currentMember.role === "admin") return;
    const permissionByView: Partial<Record<View, string>> = {
      pipeline: "crm",
      companies: "crm",
      contacts: "crm",
      activities: "crm",
      goals: "crm",
      proposals: "proposals",
      catalog: "proposals",
      sales: "sales",
      projects: "sales",
      service_calls: "sales",
      billings: "billing",
      receivables: "receivables",
      payables: "payables",
      reports: "reports",
      team: "settings",
      settings: "settings",
    };
    const required = permissionByView[view];
    if (required && !can(required)) setView("dashboard");
  }, [currentMember, view]);
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
  function openNew(
    kind:
      | "company"
      | "contact"
      | "opportunity"
      | "activity"
      | "goal"
      | "proposal"
      | "catalog"
      | "equipment"
      | "payable"
      | "member"
      | "service_call",
  ) {
    setEditingId(null);
    setError("");
    if (kind === "company")
      setCompanyForm({
        name: "",
        document: "",
        segment: "",
        preferredPriceTable: "padrao",
        isClient: true,
        isServiceTaker: false,
        isServiceLocation: false,
      });
    if (kind === "company") setCompanyLogoFile(null);
    if (kind === "contact")
      setContactForm({
        name: "",
        companyId: "",
        role: "",
        email: "",
        phone: "",
      });
    if (kind === "opportunity")
      setOpportunityForm({
        title: "",
        companyId: "",
        value: "",
        expectedCloseAt: "",
        probability: "10",
        temperature: "warm",
      });
    if (kind === "activity")
      setActivityForm({
        opportunityId: "",
        type: "retorno",
        description: "",
        dueAt: "",
      });
    if (kind === "proposal") {
      const validUntil = new Date(
        Date.now() + (settings?.proposalValidityDays ?? 15) * 86400000,
      )
        .toISOString()
        .slice(0, 10);
      setProposalForm({
        opportunityId: "",
        companyId: "",
        customerOrder: "",
        requester: "",
        priceTable: settings?.defaultPriceTable ?? "padrao",
        validUntil,
        discount: "0",
        notes: settings?.proposalNotes ?? "",
        items: [
          {
            category: "servico",
            description: "",
            quantity: 1,
            unitCost: "",
            unitPrice: "",
          },
        ],
      });
    }
    if (kind === "proposal") setEditingProposalId(null);
    if (kind === "catalog") {
      setEditingId(null);
      setCatalogForm({
        category: "material",
        code: "",
        description: "",
        unit: "un",
        cost: "",
        competitivePrice: "",
        standardPrice: "",
        valuePrice: "",
      });
    }
    if (kind === "equipment") {
      setEditingId(null);
      setEquipmentForm({ code: "", description: "", brand: "", model: "", serialNumber: "", inventoryNumber: "", unit: "un", cost: "" });
    }
    if (kind === "payable")
      setPayableForm({
        supplierName: "",
        supplierDocument: "",
        supplierEmail: "",
        supplierPhone: "",
        companyId: "",
        project: "",
        description: "",
        reference: "",
        category: "fornecedor",
        amount: "",
        installments: "1",
        dueDate: "",
      });
    if (kind === "member")
      setMemberForm({
        name: "",
        email: "",
        jobTitle: "",
        role: "seller",
        permissions: ["crm", "proposals", "sales"],
        active: true,
      });
    if (kind === "goal")
      setGoalForm({
        name: "",
        type: "sales",
        target: "",
        startsAt: `${new Date().getFullYear()}-01-01`,
        endsAt: `${new Date().getFullYear()}-12-31`,
        active: true,
      });
    if (kind === "service_call")
      setServiceCallForm({
        number: "",
        companyId: "",
        companyName: "",
        serviceTakerCompanyId: "",
        serviceTaker: "",
        requestOrigin: "telefone",
        department: "",
        customerTicket: "",
        saleId: "",
        location: "",
        locationId: "",
        locationCompanyId: "",
        contactName: "",
        technician: "",
        serviceType: "visita",
        priority: "normal",
        scheduledAt: "",
        subject: "",
        description: "",
        executedService: "",
        consumablesUsed: false,
        consumablesDescription: "",
        partsReplaced: false,
        partsDescription: "",
        expensesAmount: "0",
        expensesDescription: "",
      });
    setDialog(kind);
  }
  function editCompany(company: Company) {
    setEditingId(company.id);
    setCompanyForm({
      name: company.name,
      document: company.document ?? "",
      segment: company.segment ?? "",
      preferredPriceTable: company.preferredPriceTable ?? "padrao",
      isClient: company.isClient,
      isServiceTaker: company.isServiceTaker,
      isServiceLocation: company.isServiceLocation,
    });
    setCompanyLogoFile(null);
    setDialog("company");
  }
  function editContact(contact: ContactRecord) {
    setEditingId(contact.id);
    setContactForm({
      name: contact.name,
      companyId: String(contact.companyId),
      role: contact.role ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
    });
    setDialog("contact");
  }
  function editOpportunity(item: Opportunity) {
    setEditingId(item.id);
    setOpportunityForm({
      title: item.title,
      companyId: String(item.companyId ?? ""),
      value: String(item.value),
      expectedCloseAt: item.expectedCloseAt ?? "",
      probability: String(item.probability),
      temperature: item.temperature,
    });
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
      setItems((current) =>
        editingId
          ? current.map((item) =>
              item.id === editingId ? fromApi(data.opportunity) : item,
            )
          : [fromApi(data.opportunity), ...current],
      );
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
      let savedCompany: Company = data.company;
      if (companyLogoFile) {
        const logoData = new FormData();
        logoData.append("companyId", String(savedCompany.id));
        logoData.append("file", companyLogoFile);
        const logoResponse = await fetch("/api/company-logos", {
          method: "POST",
          body: logoData,
        });
        const logoPayload = await logoResponse.json();
        if (!logoResponse.ok) throw new Error(logoPayload.error);
        savedCompany = logoPayload.company;
      }
      setCompanies((current) =>
        (editingId
          ? current.map((company) =>
              company.id === editingId ? savedCompany : company,
            )
          : [...current, savedCompany]
        ).sort((a, b) => a.name.localeCompare(b.name)),
      );
      setContacts((current) =>
        current.map((contact) =>
          contact.companyId === savedCompany.id
            ? { ...contact, companyName: savedCompany.name }
            : contact,
        ),
      );
      setItems((current) =>
        current.map((item) =>
          item.companyId === savedCompany.id
            ? { ...item, company: savedCompany.name }
            : item,
        ),
      );
      setCompanyForm({
        name: "",
        document: "",
        segment: "",
        preferredPriceTable: "padrao",
        isClient: true,
        isServiceTaker: false,
        isServiceLocation: false,
      });
      setCompanyLogoFile(null);
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
      setContacts((current) =>
        (editingId
          ? current.map((contact) =>
              contact.id === editingId ? data.contact : contact,
            )
          : [...current, data.contact]
        ).sort((a, b) => a.name.localeCompare(b.name)),
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
  async function createActivity(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...activityForm,
          opportunityId: Number(activityForm.opportunityId),
          dueAt: activityForm.dueAt || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setActivities((current) => [data.activity, ...current]);
      setActivityForm({
        opportunityId: "",
        type: "retorno",
        description: "",
        dueAt: "",
      });
      setDialog(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível cadastrar a atividade.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function toggleActivity(activity: ActivityRecord) {
    const completed = !activity.completedAt;
    const previous = activities;
    setActivities((current) =>
      current.map((item) =>
        item.id === activity.id
          ? {
              ...item,
              completedAt: completed ? new Date().toISOString() : null,
            }
          : item,
      ),
    );
    try {
      const response = await fetch("/api/activities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activity.id, completed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
    } catch (reason) {
      setActivities(previous);
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar a atividade.",
      );
    }
  }
  async function deleteActivity(activity: ActivityRecord) {
    try {
      const response = await fetch(`/api/activities?id=${activity.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setActivities((current) =>
        current.filter((item) => item.id !== activity.id),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível excluir a atividade.",
      );
    }
  }
  async function createProposal(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const currentProposal = proposals.find(
        (item) => item.id === editingProposalId,
      );
      const response = await fetch("/api/proposals", {
        method: editingProposalId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...proposalForm,
          id: editingProposalId,
          status: currentProposal?.status ?? "rascunho",
          opportunityId: Number(proposalForm.opportunityId),
          discount: Number(proposalForm.discount),
          items: proposalForm.items.map((item) => ({
            ...item,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProposals((current) =>
        editingProposalId
          ? current.map((item) =>
              item.id === editingProposalId ? data.proposal : item,
            )
          : [data.proposal, ...current],
      );
      setDialog(null);
      setEditingProposalId(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível cadastrar a proposta.",
      );
    } finally {
      setSaving(false);
    }
  }
  function editProposal(proposal: ProposalRecord) {
    setEditingProposalId(proposal.id);
    setProposalForm({
      opportunityId: proposal.opportunityId
        ? String(proposal.opportunityId)
        : "",
      companyId: proposal.companyId ? String(proposal.companyId) : "",
      customerOrder: proposal.customerOrder ?? "",
      requester: proposal.requester ?? "",
      priceTable: proposal.priceTable ?? "padrao",
      validUntil: proposal.validUntil ?? "",
      discount: String(proposal.discount),
      notes: proposal.notes ?? "",
      items: proposal.items.map((item) => ({
        catalogId: item.catalogId,
        category: item.category,
        description: item.description,
        quantity: item.quantity,
        unitCost: item.unitCost ?? 0,
        unitPrice: item.unitPrice,
      })),
    });
    setSelectedProposalId(null);
    setDialog("proposal");
  }
  async function saveCatalog(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/catalog", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...catalogForm,
          id: editingId,
          cost: Number(catalogForm.cost),
          competitivePrice: Number(catalogForm.competitivePrice),
          standardPrice: Number(catalogForm.standardPrice),
          valuePrice: Number(catalogForm.valuePrice),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCatalog((current) =>
        (editingId
          ? current.map((item) => (item.id === editingId ? data.item : item))
          : [...current, data.item]
        ).sort((a, b) => a.description.localeCompare(b.description)),
      );
      setDialog(null);
      setEditingId(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar o item.",
      );
    } finally {
      setSaving(false);
    }
  }
  function editCatalog(item: CatalogItem) {
    setEditingId(item.id);
    setCatalogForm({
      category: item.category,
      code: item.code ?? "",
      description: item.description,
      unit: item.unit,
      cost: String(item.cost),
      competitivePrice: String(item.competitivePrice),
      standardPrice: String(item.standardPrice),
      valuePrice: String(item.valuePrice),
    });
    setDialog("catalog");
  }
  async function deleteCatalog(item: CatalogItem) {
    if (!window.confirm(`Excluir “${item.description}”?`)) return;
    const response = await fetch(`/api/catalog?id=${item.id}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (response.ok)
      setCatalog((current) =>
        current.filter((currentItem) => currentItem.id !== item.id),
      );
    else setError(data.error);
  }
  async function saveEquipment(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/equipment", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...equipmentForm, id: editingId, cost: Number(equipmentForm.cost) }),
      });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setEquipmentCatalog((current) => (editingId ? current.map((item) => item.id === editingId ? data.item : item) : [...current, data.item]).sort((a,b) => a.description.localeCompare(b.description)));
      setDialog(null); setEditingId(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o equipamento ou peça."); }
    finally { setSaving(false); }
  }
  function editEquipment(item: EquipmentCatalogItem) {
    setEditingId(item.id);
    setEquipmentForm({ code: item.code ?? "", description: item.description, brand: item.brand ?? "", model: item.model ?? "", serialNumber: item.serialNumber ?? "", inventoryNumber: item.inventoryNumber ?? "", unit: item.unit, cost: String(item.cost) });
    setDialog("equipment");
  }
  async function deleteEquipment(item: EquipmentCatalogItem) {
    if (!window.confirm(`Excluir ${item.description}?`)) return;
    const response = await fetch(`/api/equipment?id=${item.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    setEquipmentCatalog((current) => current.filter((entry) => entry.id !== item.id));
  }
  const catalogPrice = (item: CatalogItem, table: string) =>
    table === "competitiva"
      ? item.competitivePrice
      : table === "valor"
        ? item.valuePrice
        : item.standardPrice;
  function addCatalogItem(id: string) {
    const item = catalog.find((entry) => entry.id === Number(id));
    if (!item || item.category === "equipamento") return;
    setProposalForm((current) => ({
      ...current,
      items: [
        ...current.items.filter(
          (entry) => entry.description || entry.unitPrice,
        ),
        {
          catalogId: item.id,
          category: item.category,
          description: item.description,
          quantity: 1,
          unitCost: item.cost,
          unitPrice: catalogPrice(item, current.priceTable),
        },
      ],
    }));
  }
  async function changeProposalStatus(id: number, status: string) {
    const previous = proposals;
    setProposals((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    try {
      const response = await fetch("/api/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
    } catch (reason) {
      setProposals(previous);
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar a proposta.",
      );
    }
  }
  async function createSale(proposal: ProposalRecord) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSales((current) => [data.sale, ...current]);
      setSelectedProposalId(null);
      navigate("sales");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível gerar o pedido.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function updateSale(sale: SaleRecord, changes: Partial<SaleRecord>) {
    const next = { ...sale, ...changes };
    setSales((current) =>
      current.map((item) => (item.id === sale.id ? next : item)),
    );
    try {
      const response = await fetch("/api/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSales((current) =>
        current.map((item) =>
          item.id === sale.id
            ? { ...next, ...data.sale, items: next.items }
            : item,
        ),
      );
    } catch (reason) {
      setSales((current) =>
        current.map((item) => (item.id === sale.id ? sale : item)),
      );
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar o pedido ou projeto.",
      );
    }
  }
  async function addProjectTask(
    saleId: number,
    task: { title: string; responsible: string; dueDate: string },
  ) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/project-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId, ...task }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProjectTasks((current) => [...current, data.task]);
      setSales((current) =>
        current.map((sale) =>
          sale.id === saleId
            ? {
                ...sale,
                progress: data.progress,
                projectStatus: data.progress > 0 ? "andamento" : "aguardando",
              }
            : sale,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível cadastrar a tarefa.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function toggleProjectTask(task: ProjectTask) {
    setError("");
    try {
      const response = await fetch("/api/project-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, completed: !task.completedAt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProjectTasks((current) =>
        current.map((item) => (item.id === task.id ? data.task : item)),
      );
      setSales((current) =>
        current.map((sale) =>
          sale.id === task.saleId
            ? {
                ...sale,
                progress: data.progress,
                projectStatus:
                  data.progress === 100
                    ? "concluido"
                    : data.progress > 0
                      ? "andamento"
                      : "aguardando",
              }
            : sale,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar a tarefa.",
      );
    }
  }
  async function deleteProjectTask(task: ProjectTask) {
    if (!window.confirm(`Excluir a tarefa “${task.title}”?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/project-tasks?id=${task.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProjectTasks((current) =>
        current.filter((item) => item.id !== task.id),
      );
      setSales((current) =>
        current.map((sale) =>
          sale.id === task.saleId
            ? {
                ...sale,
                progress: data.progress,
                projectStatus:
                  data.progress === 100
                    ? "concluido"
                    : data.progress > 0
                      ? "andamento"
                      : "aguardando",
              }
            : sale,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível excluir a tarefa.",
      );
    }
  }
  async function uploadProjectFile(saleId: number, file: File) {
    setSaving(true);
    setError("");
    try {
      const body = new FormData();
      body.append("saleId", String(saleId));
      body.append("file", file);
      const response = await fetch("/api/project-files", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProjectFiles((current) => [...current, data.file]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível enviar o arquivo.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function deleteProjectFile(file: ProjectFile) {
    if (!window.confirm(`Excluir o arquivo “${file.name}”?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/project-files?id=${file.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProjectFiles((current) =>
        current.filter((item) => item.id !== file.id),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível excluir o arquivo.",
      );
    }
  }
  async function createBilling(sale: SaleRecord) {
    setSaving(true);
    try {
      const response = await fetch("/api/billings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId: sale.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setBillings((current) => [data.billing, ...current]);
      navigate("billings");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível preparar o faturamento.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function updateBilling(
    billing: BillingRecord,
    changes: Partial<BillingRecord>,
  ) {
    const next = { ...billing, ...changes };
    setBillings((current) =>
      current.map((item) => (item.id === billing.id ? next : item)),
    );
    try {
      const response = await fetch("/api/billings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setBillings((current) =>
        current.map((item) =>
          item.id === billing.id ? { ...next, ...data.billing } : item,
        ),
      );
    } catch (reason) {
      setBillings((current) =>
        current.map((item) => (item.id === billing.id ? billing : item)),
      );
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar o faturamento.",
      );
    }
  }
  async function generateReceivables(billing: BillingRecord) {
    try {
      const response = await fetch("/api/receivables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingId: billing.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReceivables((current) => [
        ...current.filter((item) => item.billingId !== billing.id),
        ...data.receivables.map((item: ReceivableRecord) => ({
          ...item,
          billingNumber: billing.number,
          companyName: billing.companyName,
        })),
      ]);
      navigate("receivables");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível gerar as parcelas.",
      );
    }
  }
  async function updateReceivable(
    item: ReceivableRecord,
    changes: Partial<ReceivableRecord>,
  ) {
    const next = { ...item, ...changes };
    setReceivables((current) =>
      current.map((entry) => (entry.id === item.id ? next : entry)),
    );
    try {
      const response = await fetch("/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReceivables((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...next, ...data.receivable } : entry,
        ),
      );
      setBillings((current) =>
        current.map((billing) =>
          billing.id === item.billingId
            ? {
                ...billing,
                receivedAmount: data.totalReceived,
                status:
                  data.totalReceived <= 0
                    ? "pendente"
                    : data.totalReceived < billing.total
                      ? "parcial"
                      : "recebido",
              }
            : billing,
        ),
      );
    } catch (reason) {
      setReceivables((current) =>
        current.map((entry) => (entry.id === item.id ? item : entry)),
      );
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar a parcela.",
      );
    }
  }
  async function createPayable(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/payables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payableForm,
          amount: Number(payableForm.amount),
          installments: Number(payableForm.installments),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPayables((current) =>
        [...current, ...data.payables].sort((a, b) =>
          a.dueDate.localeCompare(b.dueDate),
        ),
      );
      setSuppliers((current) =>
        current.some((item) => item.id === data.supplier.id)
          ? current
          : [...current, data.supplier].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
      );
      setDialog(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível cadastrar a conta a pagar.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function updatePayable(
    item: PayableRecord,
    changes: Partial<PayableRecord> & { action?: string },
  ) {
    const optimistic = { ...item, ...changes };
    setPayables((current) =>
      current.map((entry) => (entry.id === item.id ? optimistic : entry)),
    );
    try {
      const response = await fetch("/api/payables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...optimistic, ...changes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPayables((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...optimistic,
                ...data.payable,
                supplierName: item.supplierName,
              }
            : entry,
        ),
      );
    } catch (reason) {
      setPayables((current) =>
        current.map((entry) => (entry.id === item.id ? item : entry)),
      );
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar a conta a pagar.",
      );
    }
  }
  function editMember(member: TeamMember) {
    setEditingId(member.id);
    setMemberForm({
      name: member.name,
      email: member.email,
      jobTitle: member.jobTitle ?? "",
      role: member.role,
      permissions: member.permissions,
      active: member.active,
    });
    setDialog("member");
  }
  async function saveMember(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/team", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...memberForm, id: editingId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setTeam((current) =>
        (editingId
          ? current.map((member) =>
              member.id === editingId ? data.member : member,
            )
          : [...current, data.member]
        ).sort((a, b) => a.name.localeCompare(b.name)),
      );
      setDialog(null);
      setEditingId(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar o usuário.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function toggleMember(member: TeamMember) {
    if (member.id === currentUserId) return;
    const previous = team;
    setTeam((current) =>
      current.map((item) =>
        item.id === member.id ? { ...item, active: !item.active } : item,
      ),
    );
    try {
      const response = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...member, active: !member.active }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setTeam((current) =>
        current.map((item) => (item.id === member.id ? data.member : item)),
      );
    } catch (reason) {
      setTeam(previous);
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível alterar o acesso.",
      );
    }
  }
  async function updateSettings(changes: SystemSettings) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSettings(data.settings);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar as configurações.",
      );
      throw reason;
    } finally {
      setSaving(false);
    }
  }
  function editGoal(goal: GoalRecord) {
    setEditingId(goal.id);
    setGoalForm({
      name: goal.name,
      type: goal.type,
      target: String(goal.target),
      startsAt: goal.startsAt,
      endsAt: goal.endsAt,
      active: goal.active,
    });
    setDialog("goal");
  }
  async function saveGoal(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/goals", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...goalForm,
          id: editingId,
          target: Number(goalForm.target),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setGoals((current) =>
        (editingId
          ? current.map((goal) => (goal.id === editingId ? data.goal : goal))
          : [...current, data.goal]
        ).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
      setDialog(null);
      setEditingId(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar a meta.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function deleteGoal(goal: GoalRecord) {
    if (!window.confirm(`Excluir a meta “${goal.name}”?`)) return;
    try {
      const response = await fetch(`/api/goals?id=${goal.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setGoals((current) => current.filter((item) => item.id !== goal.id));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível excluir a meta.",
      );
    }
  }
  function editServiceCall(call: ServiceCall) {
    setEditingId(call.id);
    setError("");
    setServiceCallForm({
      number: serviceCallNumber(call.number),
      companyId: String(call.companyId ?? ""),
      companyName: call.companyName,
      serviceTakerCompanyId: String(call.serviceTakerCompanyId ?? ""),
      serviceTaker: call.serviceTaker ?? "",
      requestOrigin: call.requestOrigin ?? "telefone",
      department: call.department ?? "",
      customerTicket: call.customerTicket ?? "",
      saleId: String(call.saleId ?? ""),
      location: call.location ?? "",
      locationId: String(call.locationId ?? ""),
      locationCompanyId: String(call.locationCompanyId ?? ""),
      contactName: call.contactName ?? "",
      technician: call.technician ?? "",
      serviceType: call.serviceType,
      priority: call.priority,
      scheduledAt: call.scheduledAt?.slice(0, 16) ?? "",
      subject: call.subject,
      description: call.description,
      executedService: call.executedService ?? "",
      consumablesUsed: call.consumablesUsed,
      consumablesDescription: call.consumablesDescription ?? "",
      partsReplaced: call.partsReplaced,
      partsDescription: call.partsDescription ?? "",
      expensesAmount: String(call.expensesAmount ?? 0),
      expensesDescription: call.expensesDescription ?? "",
    });
    setSelectedServiceCallId(null);
    setDialog("service_call");
  }
  async function createServiceCall(event: React.FormEvent) {
    event.preventDefault();
    const clientSearch = serviceCallForm.companyName.trim().toLocaleLowerCase();
    const exactCompany = companies.find(
      (item) => item.name.toLocaleLowerCase() === clientSearch,
    );
    const partialCompanies = companies.filter((item) =>
      item.name.toLocaleLowerCase().includes(clientSearch),
    );
    const company =
      exactCompany ??
      (partialCompanies.length === 1 ? partialCompanies[0] : undefined);
    if (!company) {
      setError(
        partialCompanies.length > 1
          ? "Há mais de um cliente com esse texto. Selecione uma das opções apresentadas."
          : "Selecione um cliente cadastrado antes de salvar o chamado.",
      );
      return;
    }
    const current = serviceCalls.find((item) => item.id === editingId);
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/service-calls", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...serviceCallForm,
          companyId: company.id,
          locationCompanyId: Number(serviceCallForm.locationCompanyId) || null,
          id: editingId,
          status: current?.status ?? "aberto",
          companyName: company.name,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (editingId)
        setServiceCalls((items) =>
          items.map((item) => (item.id === editingId ? data.call : item)),
        );
      else {
        setServiceCalls((items) => [data.call, ...items]);
        setServiceCallHistory((items) => [
          ...items,
          {
            id: Date.now(),
            serviceCallId: data.call.id,
            fromStatus: null,
            toStatus: "aberto",
            changedBy: user.name,
            createdAt: data.call.createdAt,
          },
        ]);
      }
      setDialog(null);
      setEditingId(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar o chamado.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function changeServiceCallStatus(call: ServiceCall, status: string) {
    if (call.status === status) return;
    if (status === "pendente") {
      window.dispatchEvent(
        new CustomEvent("tdk:service-call-pending", {
          detail: {
            callId: call.id,
            callNumber: serviceCallNumber(call.number),
          },
        }),
      );
      return;
    }
    const previous = serviceCalls;
    const changedAt = new Date().toISOString();
    setServiceCalls((current) =>
      current.map((item) =>
        item.id === call.id ? { ...item, status, updatedAt: changedAt } : item,
      ),
    );
    try {
      const response = await fetch("/api/service-calls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: call.id, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setServiceCalls((current) =>
        current.map((item) => (item.id === call.id ? data.call : item)),
      );
      setServiceCallHistory((current) => [
        ...current,
        {
          id: Date.now(),
          serviceCallId: call.id,
          fromStatus: call.status,
          toStatus: status,
          changedBy: user.name,
          createdAt: changedAt,
        },
      ]);
    } catch (reason) {
      setServiceCalls(previous);
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar o chamado.",
      );
    }
  }
  async function uploadServiceCallPhoto(serviceCallId: number, file: File) {
    setSaving(true);
    setError("");
    try {
      const body = new FormData();
      body.append("serviceCallId", String(serviceCallId));
      body.append("file", file);
      const response = await fetch("/api/service-call-files", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setServiceCallFiles((current) => [...current, data.file]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível enviar a foto.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function deleteServiceCallPhoto(file: ServiceCallFile) {
    if (!window.confirm(`Excluir a foto “${file.name}”?`)) return;
    try {
      const response = await fetch(`/api/service-call-files?id=${file.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setServiceCallFiles((current) =>
        current.filter((item) => item.id !== file.id),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível excluir a foto.",
      );
    }
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    setError("");
    try {
      const endpoint =
        deleteTarget.kind === "company"
          ? "companies"
          : deleteTarget.kind === "contact"
            ? "contacts"
            : "opportunities";
      const response = await fetch(`/api/${endpoint}?id=${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (deleteTarget.kind === "company")
        setCompanies((current) =>
          current.filter((item) => item.id !== deleteTarget.id),
        );
      if (deleteTarget.kind === "contact")
        setContacts((current) =>
          current.filter((item) => item.id !== deleteTarget.id),
        );
      if (deleteTarget.kind === "opportunity")
        setItems((current) =>
          current.filter((item) => item.id !== deleteTarget.id),
        );
      setDeleteTarget(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível excluir o cadastro.",
      );
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
    goals: [
      "COMERCIAL • OBJETIVOS",
      "Metas comerciais",
      "Defina objetivos e acompanhe automaticamente a evolução dos resultados.",
    ],
    proposals: [
      "COMERCIAL • PROPOSTAS",
      "Propostas comerciais",
      "Monte valores de materiais e serviços vinculados às oportunidades.",
    ],
    catalog: [
      "COMERCIAL • CATÁLOGO",
      "Produtos, serviços e preços",
      "Controle custos e preços para diferentes estratégias comerciais.",
    ],
    equipment: [
      "OPERAÇÃO • CADASTROS",
      "Equipamentos e peças",
      "Mantenha uma base própria para os equipamentos e peças usados nos atendimentos.",
    ],
    sales: [
      "GESTÃO • PEDIDOS",
      "Pedidos e vendas",
      "Acompanhe a execução das propostas aprovadas.",
    ],
    projects: [
      "OPERAÇÃO • EXECUÇÃO",
      "Projetos",
      "Planeje responsáveis, prazos e evolução dos pedidos em execução.",
    ],
    service_calls: [
      "OPERAÇÃO • ATENDIMENTOS",
      "Chamados e ordens de serviço",
      "Receba, distribua e acompanhe os atendimentos técnicos desde a abertura.",
    ],
    billings: [
      "FINANCEIRO • FATURAMENTO",
      "Faturamento",
      "Controle notas fiscais, vencimentos e valores recebidos.",
    ],
    receivables: [
      "FINANCEIRO • RECEBIMENTOS",
      "Contas a receber",
      "Acompanhe parcelas, vencimentos e pagamentos.",
    ],
    payables: [
      "FINANCEIRO • PAGAMENTOS",
      "Contas a pagar",
      "Controle fornecedores, despesas, vencimentos e pagamentos.",
    ],
    team: [
      "ADMINISTRAÇÃO • ACESSOS",
      "Equipe e permissões",
      "Defina quem pode acessar cada área do TDK Manager.",
    ],
    reports: [
      "GESTÃO • INDICADORES",
      "Relatórios gerenciais",
      "Analise resultados comerciais e financeiros por período.",
    ],
    settings: [
      "ADMINISTRAÇÃO • PREFERÊNCIAS",
      "Configurações",
      "Centralize os dados da TDK e os padrões utilizados nos cadastros.",
    ],
  };
  const primaryAction =
    view === "goals"
      ? () => openNew("goal")
      : view === "settings"
        ? () =>
            (
              document.getElementById("settings-form") as HTMLFormElement | null
            )?.requestSubmit()
        : view === "reports"
          ? () => window.print()
          : view === "team"
            ? () => openNew("member")
            : view === "payables"
              ? () => openNew("payable")
              : view === "receivables"
                ? () => navigate("billings")
                : view === "billings"
                  ? () => navigate("sales")
                  : view === "service_calls"
                    ? () => openNew("service_call")
                    : view === "projects"
                      ? () => navigate("sales")
                      : view === "sales"
                        ? () => navigate("proposals")
                        : view === "equipment"
                          ? () => openNew("equipment")
                        : view === "catalog"
                          ? () => openNew("catalog")
                          : view === "proposals"
                            ? () => openNew("proposal")
                            : view === "activities"
                              ? () => openNew("activity")
                              : view === "companies"
                                ? () => openNew("company")
                                : view === "contacts"
                                  ? () => openNew("contact")
                                  : () => openNew("opportunity");
  const primaryLabel =
    view === "goals"
      ? "Nova meta"
      : view === "settings"
        ? "Salvar configurações"
        : view === "reports"
          ? "Imprimir relatório"
          : view === "team"
            ? "Novo usuário"
            : view === "payables"
              ? "Nova conta"
              : view === "receivables"
                ? "Ver faturamento"
                : view === "billings"
                  ? "Ver pedidos"
                  : view === "service_calls"
                    ? "Novo chamado"
                    : view === "projects"
                      ? "Ver pedidos"
                      : view === "sales"
                        ? "Ver propostas"
                        : view === "equipment"
                          ? "Novo equipamento"
                        : view === "catalog"
                          ? "Novo item"
                          : view === "proposals"
                            ? "Nova proposta"
                            : view === "activities"
                              ? "Nova atividade"
                              : view === "companies"
                                ? "Nova empresa"
                                : view === "contacts"
                                  ? "Novo contato"
                                  : "Nova oportunidade";
  const selectedOpportunity =
    items.find((item) => item.id === selectedOpportunityId) ?? null;
  const selectedActivities = selectedOpportunity
    ? activities.filter(
        (activity) => activity.opportunityId === selectedOpportunity.id,
      )
    : [];
  const selectedProposal =
    proposals.find((proposal) => proposal.id === selectedProposalId) ?? null;
  const selectedServiceCall =
    serviceCalls.find((call) => call.id === selectedServiceCallId) ?? null;
  const editingServiceCall =
    serviceCalls.find((call) => call.id === editingId) ?? null;
  const proposalCost = proposalForm.items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitCost || 0),
    0,
  );
  const proposalNet = Math.max(
    0,
    proposalForm.items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice || 0),
      0,
    ) - Number(proposalForm.discount || 0),
  );
  const proposalProfit = proposalNet - proposalCost;
  const proposalMargin = proposalNet ? (proposalProfit / proposalNet) * 100 : 0;
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const proposalLimit = new Date(today.getTime() + 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  const alerts: {
    id: string;
    title: string;
    detail: string;
    view: View;
    tone: "danger" | "warning";
  }[] = [
    ...(can("crm")
      ? activities
          .filter(
            (activity) =>
              !activity.completedAt &&
              activity.dueAt &&
              new Date(activity.dueAt).getTime() < today.getTime(),
          )
          .map((activity) => ({
            id: `activity-${activity.id}`,
            title: "Atividade atrasada",
            detail: `${activity.description} • ${activity.companyName}`,
            view: "activities" as View,
            tone: "danger" as const,
          }))
      : []),
    ...(can("proposals")
      ? proposals
          .filter(
            (proposal) =>
              proposal.validUntil &&
              ["rascunho", "enviada"].includes(proposal.status) &&
              proposal.validUntil >= todayKey &&
              proposal.validUntil <= proposalLimit,
          )
          .map((proposal) => ({
            id: `proposal-${proposal.id}`,
            title: "Proposta próxima do vencimento",
            detail: `${proposal.number} • ${proposal.companyName}`,
            view: "proposals" as View,
            tone: "warning" as const,
          }))
      : []),
    ...(can("receivables")
      ? receivables
          .filter(
            (receivable) =>
              receivable.status !== "recebido" && receivable.dueDate < todayKey,
          )
          .map((receivable) => ({
            id: `receivable-${receivable.id}`,
            title: "Recebimento vencido",
            detail: `${receivable.billingNumber} • ${receivable.companyName} • ${money(receivable.amount - receivable.receivedAmount)}`,
            view: "receivables" as View,
            tone: "danger" as const,
          }))
      : []),
    ...(can("payables")
      ? payables
          .filter(
            (payable) =>
              !["pago", "cancelado"].includes(payable.status) &&
              payable.dueDate < todayKey,
          )
          .map((payable) => ({
            id: `payable-${payable.id}`,
            title: "Pagamento vencido",
            detail: `${payable.description} • ${payable.supplierName} • ${money(payable.amount - payable.paidAmount)}`,
            view: "payables" as View,
            tone: "danger" as const,
          }))
      : []),
    ...(can("sales")
      ? sales
          .filter(
            (sale) =>
              sale.scheduledEnd &&
              sale.scheduledEnd < todayKey &&
              !["concluido", "cancelado"].includes(sale.projectStatus),
          )
          .map((sale) => ({
            id: `project-${sale.id}`,
            title: "Projeto atrasado",
            detail: `${sale.number} • ${sale.companyName} • ${sale.progress || 0}% concluído`,
            view: "projects" as View,
            tone: "danger" as const,
          }))
      : []),
    ...(can("sales")
      ? projectTasks
          .filter(
            (task) =>
              !task.completedAt && task.dueDate && task.dueDate < todayKey,
          )
          .map((task) => {
            const sale = sales.find((item) => item.id === task.saleId);
            return {
              id: `project-task-${task.id}`,
              title: "Tarefa de projeto atrasada",
              detail: `${task.title} • ${sale?.companyName ?? "Projeto"}`,
              view: "projects" as View,
              tone: "danger" as const,
            };
          })
      : []),
  ];

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
          {(can("crm") || can("proposals") || can("sales")) && <p>COMERCIAL</p>}
          {can("crm") && (
            <>
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
              <NavButton
                active={view === "activities"}
                onClick={() => navigate("activities")}
                icon={<CalendarClock />}
              >
                Atividades{" "}
                <span className="nav-count">
                  {activities.filter((item) => !item.completedAt).length}
                </span>
              </NavButton>
              <NavButton
                active={view === "goals"}
                onClick={() => navigate("goals")}
                icon={<Target />}
              >
                Metas{" "}
                <span className="nav-count">
                  {goals.filter((goal) => goal.active).length}
                </span>
              </NavButton>
            </>
          )}
          {(can("proposals") || can("sales")) && <p>GESTÃO</p>}
          {can("proposals") && (
            <>
              <NavButton
                active={view === "proposals"}
                onClick={() => navigate("proposals")}
                icon={<CircleDollarSign />}
              >
                Propostas <span className="nav-count">{proposals.length}</span>
              </NavButton>
              <NavButton
                active={view === "catalog"}
                onClick={() => navigate("catalog")}
                icon={<PackageOpen />}
              >
                Produtos e serviços{" "}
                <span className="nav-count">{catalog.length}</span>
              </NavButton>
              <NavButton
                active={view === "equipment"}
                onClick={() => navigate("equipment")}
                icon={<Wrench />}
              >
                Equipamentos e peças <span className="nav-count">{equipmentCatalog.length}</span>
              </NavButton>
            </>
          )}
          {can("sales") && (
            <NavButton
              active={view === "sales"}
              onClick={() => navigate("sales")}
              icon={<ShoppingCart />}
            >
              Pedidos e vendas <span className="nav-count">{sales.length}</span>
            </NavButton>
          )}
          {can("sales") && (
            <NavButton
              active={view === "projects"}
              onClick={() => navigate("projects")}
              icon={<ClipboardList />}
            >
              Projetos{" "}
              <span className="nav-count">
                {
                  sales.filter(
                    (item) =>
                      !["concluido", "cancelado"].includes(item.projectStatus),
                  ).length
                }
              </span>
            </NavButton>
          )}
          {can("sales") && (
            <NavButton
              active={view === "service_calls"}
              onClick={() => navigate("service_calls")}
              icon={<Wrench />}
            >
              Chamados e OS{" "}
              <span className="nav-count">
                {
                  serviceCalls.filter(
                    (item) => !["concluido", "cancelado"].includes(item.status),
                  ).length
                }
              </span>
            </NavButton>
          )}
          {(can("billing") || can("receivables") || can("payables")) && (
            <p>FINANCEIRO</p>
          )}
          {can("billing") && (
            <NavButton
              active={view === "billings"}
              onClick={() => navigate("billings")}
              icon={<ReceiptText />}
            >
              Faturamento{" "}
              <span className="nav-count">
                {billings.filter((item) => item.status !== "recebido").length}
              </span>
            </NavButton>
          )}
          {can("receivables") && (
            <NavButton
              active={view === "receivables"}
              onClick={() => navigate("receivables")}
              icon={<CircleDollarSign />}
            >
              Contas a receber{" "}
              <span className="nav-count">
                {
                  receivables.filter((item) => item.status !== "recebido")
                    .length
                }
              </span>
            </NavButton>
          )}
          {can("payables") && (
            <NavButton
              active={view === "payables"}
              onClick={() => navigate("payables")}
              icon={<WalletCards />}
            >
              Contas a pagar{" "}
              <span className="nav-count">
                {
                  payables.filter(
                    (item) => !["pago", "cancelado"].includes(item.status),
                  ).length
                }
              </span>
            </NavButton>
          )}
          {can("settings") && (
            <NavButton
              active={view === "team"}
              onClick={() => navigate("team")}
              icon={<Users />}
            >
              Equipe e permissões{" "}
              <span className="nav-count">
                {team.filter((member) => member.active).length}
              </span>
            </NavButton>
          )}
          {can("reports") && (
            <NavButton
              active={view === "reports"}
              onClick={() => navigate("reports")}
              icon={<TrendingUp />}
            >
              Relatórios
            </NavButton>
          )}
        </nav>
        <div className="sidebar-footer">
          {can("settings") && (
            <button
              className={view === "settings" ? "active" : ""}
              onClick={() => navigate("settings")}
            >
              <Settings /> Configurações
            </button>
          )}
          <div className="user">
            <span>{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>
                {{
                  admin: "Administrador",
                  manager: "Gestor",
                  seller: "Comercial",
                  finance: "Financeiro",
                  viewer: "Consulta",
                }[currentMember?.role ?? ""] ?? "Usuário"}
              </small>
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
          <div className="notification-wrap">
            <button
              className="icon-button"
              aria-label="Notificações"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell />
              {alerts.length > 0 && <i />}
            </button>
            {notificationsOpen && (
              <div className="notification-panel">
                <header>
                  <div>
                    <small>CENTRAL DE ALERTAS</small>
                    <strong>Pendências importantes</strong>
                  </div>
                  <button
                    type="button"
                    aria-label="Fechar alertas"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    <X />
                  </button>
                </header>
                {alerts.length ? (
                  <div className="notification-list">
                    {alerts.slice(0, 12).map((alert) => (
                      <button
                        type="button"
                        key={alert.id}
                        className={`notification-item ${alert.tone}`}
                        onClick={() => {
                          navigate(alert.view);
                          setNotificationsOpen(false);
                        }}
                      >
                        <span>
                          <i />
                        </span>
                        <div>
                          <strong>{alert.title}</strong>
                          <small>{alert.detail}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="notification-empty">
                    <CheckCircle2 />
                    <strong>Nenhuma pendência crítica</strong>
                    <span>Está tudo em dia por aqui.</span>
                  </div>
                )}
                {alerts.length > 12 && (
                  <footer>
                    Mais {alerts.length - 12} pendências nos respectivos
                    módulos.
                  </footer>
                )}
              </div>
            )}
          </div>
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
              {view === "reports" ? (
                <Printer />
              ) : view === "settings" ? (
                <Settings />
              ) : view === "projects" ? (
                <ShoppingCart />
              ) : (
                <Plus />
              )}{" "}
              {primaryLabel}
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
              remove={(item) =>
                setDeleteTarget({
                  kind: "opportunity",
                  id: item.id,
                  name: item.title,
                })
              }
            />
          ) : view === "payables" ? (
            <Payables
              payables={payables}
              update={updatePayable}
              add={() => openNew("payable")}
            />
          ) : view === "team" ? (
            <Team
              team={team}
              currentUserId={currentUserId}
              add={() => openNew("member")}
              edit={editMember}
              toggle={toggleMember}
            />
          ) : view === "reports" ? (
            <Reports
              opportunities={items}
              proposals={proposals}
              sales={sales}
              billings={billings}
              receivables={receivables}
              payables={payables}
            />
          ) : view === "settings" ? (
            settings ? (
              <SettingsPage
                settings={settings}
                saving={saving}
                save={updateSettings}
              />
            ) : (
              <Loading />
            )
          ) : view === "goals" ? (
            <Goals
              goals={goals}
              sales={sales}
              proposals={proposals}
              receivables={receivables}
              add={() => openNew("goal")}
              edit={editGoal}
              remove={deleteGoal}
            />
          ) : view === "receivables" ? (
            <Receivables receivables={receivables} update={updateReceivable} />
          ) : view === "billings" ? (
            <Billings
              billings={billings}
              update={updateBilling}
              generate={generateReceivables}
            />
          ) : view === "projects" ? (
            <Projects
              sales={sales}
              tasks={projectTasks}
              files={projectFiles}
              team={team.filter((member) => member.active)}
              update={updateSale}
              addTask={addProjectTask}
              toggleTask={toggleProjectTask}
              deleteTask={deleteProjectTask}
              uploadFile={uploadProjectFile}
              deleteFile={deleteProjectFile}
              saving={saving}
            />
          ) : view === "service_calls" ? (
            <ServiceCalls
              calls={serviceCalls}
              history={serviceCallHistory}
              companies={companies}
              changeStatus={changeServiceCallStatus}
              inspect={(call) => setSelectedServiceCallId(call.id)}
              edit={editServiceCall}
            />
          ) : view === "sales" ? (
            <Sales
              sales={sales}
              proposals={proposals}
              billings={billings}
              update={updateSale}
              bill={createBilling}
            />
          ) : view === "equipment" ? (
            <EquipmentCatalog
              items={equipmentCatalog}
              add={() => openNew("equipment")}
              edit={editEquipment}
              remove={deleteEquipment}
            />
          ) : view === "catalog" ? (
            <Catalog
              catalog={catalog}
              add={() => openNew("catalog")}
              edit={editCatalog}
              remove={deleteCatalog}
            />
          ) : view === "proposals" ? (
            <Proposals
              proposals={proposals}
              add={() => openNew("proposal")}
              inspect={(proposal) => setSelectedProposalId(proposal.id)}
            />
          ) : view === "activities" ? (
            <Activities
              activities={activities}
              add={() => openNew("activity")}
              toggle={toggleActivity}
              remove={deleteActivity}
            />
          ) : view === "companies" ? (
            <Companies
              companies={filteredCompanies}
              contacts={contacts}
              opportunities={items}
              locations={serviceLocations}
              onLocationsChange={setServiceLocations}
              add={() => openNew("company")}
              edit={editCompany}
              remove={(company) =>
                setDeleteTarget({
                  kind: "company",
                  id: company.id,
                  name: company.name,
                })
              }
            />
          ) : (
            <Contacts
              contacts={filteredContacts}
              add={() => openNew("contact")}
              edit={editContact}
              remove={(contact) =>
                setDeleteTarget({
                  kind: "contact",
                  id: contact.id,
                  name: contact.name,
                })
              }
            />
          )}
        </div>
      </main>

      <Sheet
        open={Boolean(selectedServiceCall)}
        onOpenChange={(open) => {
          if (!open) setSelectedServiceCallId(null);
        }}
      >
        <SheetContent className="opportunity-sheet service-call-sheet">
          {selectedServiceCall && (
            <>
              <SheetHeader className="opportunity-sheet-head">
                <span className="dialog-kicker">ORDEM DE SERVIÇO</span>
                <SheetTitle>
                  {serviceCallNumber(selectedServiceCall.number)}
                </SheetTitle>
                <SheetDescription>
                  {selectedServiceCall.companyName} ·{" "}
                  {selectedServiceCall.subject}
                </SheetDescription>
              </SheetHeader>
              <div className="opportunity-sheet-body">
                <div
                  className={`service-call-detail-priority priority-${selectedServiceCall.priority}`}
                >
                  <span>Prioridade</span>
                  <strong>{selectedServiceCall.priority}</strong>
                </div>
                <div className="service-call-detail-grid">
                  <div>
                    <span>Status</span>
                    <select
                      value={selectedServiceCall.status}
                      onChange={(event) =>
                        changeServiceCallStatus(
                          selectedServiceCall,
                          event.target.value,
                        )
                      }
                    >
                      {serviceCallStatuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span>Técnico responsável</span>
                    <strong>
                      {selectedServiceCall.technician || "Não definido"}
                    </strong>
                  </div>
                  <div>
                    <span>Agendamento</span>
                    <strong>
                      {selectedServiceCall.scheduledAt
                        ? new Intl.DateTimeFormat("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(selectedServiceCall.scheduledAt))
                        : "Não agendado"}
                    </strong>
                  </div>
                  <div>
                    <span>Tipo de serviço</span>
                    <strong>{selectedServiceCall.serviceType}</strong>
                  </div>
                  <div>
                    <span>Solicitante</span>
                    <strong>
                      {selectedServiceCall.contactName || "Não informado"}
                    </strong>
                  </div>
                  <div>
                    <span>Local</span>
                    <strong>
                      {selectedServiceCall.location || "Não informado"}
                    </strong>
                  </div>
                </div>
                <section className="service-call-description">
                  <h3>Descrição do chamado</h3>
                  <p>{selectedServiceCall.description}</p>
                </section>
                {reportServiceCallStatuses.has(selectedServiceCall.status) && (
                  <div className="service-report-actions">
                    <Button
                      onClick={() =>
                        window.open(
                          `/relatorio-atendimento?id=${selectedServiceCall.id}`,
                          "_blank",
                        )
                      }
                    >
                      <Printer /> Gerar PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const link = `${window.location.origin}/relatorio-atendimento?id=${selectedServiceCall.id}`;
                        window.location.href = `mailto:?subject=${encodeURIComponent(`Atendimento ${serviceCallNumber(selectedServiceCall.number)} — TDK`)}&body=${encodeURIComponent(`Segue o relatório do atendimento ${serviceCallNumber(selectedServiceCall.number)}.\n\n${link}`)}`;
                      }}
                    >
                      <Mail /> E-mail
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const link = `${window.location.origin}/relatorio-atendimento?id=${selectedServiceCall.id}`;
                        window.open(
                          `https://wa.me/?text=${encodeURIComponent(`Atendimento ${serviceCallNumber(selectedServiceCall.number)} — TDK\n${link}`)}`,
                          "_blank",
                        );
                      }}
                    >
                      <Phone /> WhatsApp
                    </Button>
                  </div>
                )}
                <section className="service-call-quick-actions">
                  <h3>Avançar atendimento</h3>
                  <div>
                    {serviceCallStatuses
                      .filter(
                        (status) =>
                          status.id !== "cancelado",
                      )
                      .map((status) => (
                        <Button
                          key={status.id}
                          variant={
                            selectedServiceCall.status === status.id
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            changeServiceCallStatus(
                              selectedServiceCall,
                              status.id,
                            )
                          }
                        >
                          {status.label}
                        </Button>
                      ))}
                  </div>
                </section>
                <section className="opportunity-history">
                  <div className="history-head">
                    <h3>Histórico do chamado</h3>
                    <span>
                      {
                        serviceCallHistory.filter(
                          (item) =>
                            item.serviceCallId === selectedServiceCall.id,
                        ).length
                      }
                    </span>
                  </div>
                  {serviceCallHistory
                    .filter(
                      (item) => item.serviceCallId === selectedServiceCall.id,
                    )
                    .slice()
                    .reverse()
                    .map((item) => (
                      <article key={item.id}>
                        <i />
                        <div>
                          <strong>
                            {item.fromStatus
                              ? `${serviceCallStatuses.find((status) => status.id === item.fromStatus)?.label ?? item.fromStatus} → `
                              : "Chamado aberto em "}
                            {serviceCallStatuses.find(
                              (status) => status.id === item.toStatus,
                            )?.label ?? item.toStatus}
                          </strong>
                          <span>
                            {new Intl.DateTimeFormat("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            }).format(new Date(item.createdAt))}
                          </span>
                        </div>
                        <small>{item.changedBy}</small>
                      </article>
                    ))}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <Sheet
        open={Boolean(selectedProposal)}
        onOpenChange={(open) => {
          if (!open) setSelectedProposalId(null);
        }}
      >
        <SheetContent className="opportunity-sheet proposal-sheet">
          {selectedProposal && (
            <>
              <SheetHeader className="opportunity-sheet-head">
                <span className="dialog-kicker">PROPOSTA COMERCIAL</span>
                <SheetTitle>{selectedProposal.number}</SheetTitle>
                <SheetDescription>
                  {selectedProposal.companyName} ·{" "}
                  {selectedProposal.opportunityTitle}
                </SheetDescription>
              </SheetHeader>
              <div className="opportunity-sheet-body">
                <div className="opportunity-value">
                  <span>Valor total</span>
                  <strong>{money(selectedProposal.total)}</strong>
                </div>
                <div className="proposal-view-meta">
                  <span>
                    Status
                    <select
                      value={selectedProposal.status}
                      onChange={(event) =>
                        changeProposalStatus(
                          selectedProposal.id,
                          event.target.value,
                        )
                      }
                    >
                      <option value="rascunho">Rascunho</option>
                      <option value="enviada">Enviada</option>
                      <option value="aprovada">Aprovada</option>
                      <option value="recusada">Recusada</option>
                      <option value="expirada">Expirada</option>
                    </select>
                  </span>
                  <span>
                    Validade
                    <strong>
                      {selectedProposal.validUntil
                        ? new Intl.DateTimeFormat("pt-BR", {
                            timeZone: "UTC",
                          }).format(
                            new Date(
                              `${selectedProposal.validUntil}T12:00:00Z`,
                            ),
                          )
                        : "Não informada"}
                    </strong>
                  </span>
                  <span>
                    Subtotal<strong>{money(selectedProposal.subtotal)}</strong>
                  </span>
                  <span>
                    Desconto<strong>{money(selectedProposal.discount)}</strong>
                  </span>
                  <span>
                    Custo total
                    <strong>
                      {money(
                        selectedProposal.items.reduce(
                          (sum, item) =>
                            sum +
                            Number(item.quantity) * Number(item.unitCost || 0),
                          0,
                        ),
                      )}
                    </strong>
                  </span>
                  <span>
                    Margem
                    <strong>
                      {selectedProposal.total
                        ? (
                            ((selectedProposal.total -
                              selectedProposal.items.reduce(
                                (sum, item) =>
                                  sum +
                                  Number(item.quantity) *
                                    Number(item.unitCost || 0),
                                0,
                              )) /
                              selectedProposal.total) *
                            100
                          ).toFixed(1)
                        : "0.0"}
                      %
                    </strong>
                  </span>
                </div>
                <div className="sheet-actions">
                  <Button onClick={() => editProposal(selectedProposal)}>
                    <Pencil /> Editar proposta
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      window.location.href = `/proposta?id=${selectedProposal.id}`;
                    }}
                  >
                    <Printer /> Gerar PDF
                  </Button>
                  {sales.some(
                    (sale) => sale.proposalId === selectedProposal.id,
                  ) && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        const sale = sales.find(
                          (item) => item.proposalId === selectedProposal.id,
                        );
                        if (sale)
                          window.location.href = `/relatorio-projeto?id=${sale.id}`;
                      }}
                    >
                      <ClipboardList /> Relatório do projeto
                    </Button>
                  )}
                </div>
                {selectedProposal.status === "aprovada" &&
                  !sales.some(
                    (sale) => sale.proposalId === selectedProposal.id,
                  ) && (
                    <Button
                      className="sale-button"
                      onClick={() => createSale(selectedProposal)}
                      disabled={saving}
                    >
                      <ShoppingCart /> Gerar pedido
                    </Button>
                  )}
                <section className="proposal-view-items">
                  <h3>Itens da proposta</h3>
                  {selectedProposal.items.map((item, index) => (
                    <article key={item.id ?? index}>
                      <div>
                        <span>
                          {item.category === "material"
                            ? "Material"
                            : "Serviço"}
                        </span>
                        <strong>{item.description}</strong>
                        <small>
                          {Number(item.quantity)} ×{" "}
                          {money(Number(item.unitPrice))}
                        </small>
                      </div>
                      <b>
                        {money(
                          Number(
                            item.total ??
                              Number(item.quantity) * Number(item.unitPrice),
                          ),
                        )}
                      </b>
                    </article>
                  ))}
                </section>
                {selectedProposal.notes && (
                  <div className="proposal-view-notes">
                    <span>Observações</span>
                    <p>{selectedProposal.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <Sheet
        open={Boolean(selectedOpportunity)}
        onOpenChange={(open) => {
          if (!open) setSelectedOpportunityId(null);
        }}
      >
        <SheetContent className="opportunity-sheet">
          {selectedOpportunity && (
            <>
              <SheetHeader className="opportunity-sheet-head">
                <span className="dialog-kicker">DETALHES DA OPORTUNIDADE</span>
                <SheetTitle>{selectedOpportunity.title}</SheetTitle>
                <SheetDescription>
                  {selectedOpportunity.company}
                </SheetDescription>
              </SheetHeader>
              <div className="opportunity-sheet-body">
                <div className="opportunity-value">
                  <span>Valor estimado</span>
                  <strong>{money(selectedOpportunity.value)}</strong>
                </div>
                <div className="opportunity-facts">
                  <div>
                    <span>Etapa atual</span>
                    <strong>
                      {stages.find(
                        (stage) => stage.id === selectedOpportunity.stage,
                      )?.label ?? selectedOpportunity.stage}
                    </strong>
                  </div>
                  <div>
                    <span>Probabilidade</span>
                    <strong>{selectedOpportunity.probability}%</strong>
                  </div>
                  <div>
                    <span>Temperatura</span>
                    <strong>
                      {selectedOpportunity.temperature === "hot"
                        ? "Alta"
                        : selectedOpportunity.temperature === "warm"
                          ? "Média"
                          : "Baixa"}
                    </strong>
                  </div>
                  <div>
                    <span>Fechamento previsto</span>
                    <strong>{selectedOpportunity.due}</strong>
                  </div>
                </div>
                <div className="probability-bar">
                  <span
                    style={{ width: `${selectedOpportunity.probability}%` }}
                  />
                </div>
                <div className="sheet-actions">
                  <Button
                    onClick={() => {
                      setSelectedOpportunityId(null);
                      editOpportunity(selectedOpportunity);
                    }}
                  >
                    <Pencil /> Editar oportunidade
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedOpportunityId(null);
                      setActivityForm({
                        opportunityId: String(selectedOpportunity.id),
                        type: "retorno",
                        description: "",
                        dueAt: "",
                      });
                      setDialog("activity");
                    }}
                  >
                    <Plus /> Nova atividade
                  </Button>
                </div>
                <section className="opportunity-history">
                  <div className="history-head">
                    <h3>Histórico de atividades</h3>
                    <span>{selectedActivities.length}</span>
                  </div>
                  {selectedActivities.length ? (
                    selectedActivities.map((activity) => (
                      <article
                        key={activity.id}
                        className={activity.completedAt ? "done" : ""}
                      >
                        <i />
                        <div>
                          <strong>{activity.description}</strong>
                          <span>
                            {activity.dueAt
                              ? new Intl.DateTimeFormat("pt-BR", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                }).format(new Date(activity.dueAt))
                              : "Sem prazo"}
                          </span>
                        </div>
                        <small>
                          {activity.completedAt ? "Concluída" : "Pendente"}
                        </small>
                      </article>
                    ))
                  ) : (
                    <p>Nenhuma atividade registrada para esta oportunidade.</p>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={dialog === "service_call"}
        onOpenChange={(open) => setDialog(open ? "service_call" : null)}
      >
        <DialogContent className="dialog service-call-dialog">
          <DialogHeader>
            <span className="dialog-kicker">ORDEM DE SERVIÇO</span>
            <DialogTitle>
              {editingId ? "Editar chamado" : "Novo chamado"}
            </DialogTitle>
            <span className="service-call-header-number">
              {editingId ? serviceCallForm.number : "Número gerado automaticamente ao salvar"}
            </span>
            <DialogDescription>
              {editingId
                ? "Complete as informações necessárias para avançar o atendimento."
                : "Registre a ocorrência. O chamado será criado diretamente como Aberto, mesmo com informações operacionais pendentes."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createServiceCall} className="form">
            <div className="form-split">
              <Field label="Tomador do serviço">
                <Input
                  list="service-takers"
                  value={serviceCallForm.serviceTaker}
                  onChange={(event) => {
                    const company = companies.find(
                      (item) => item.name === event.target.value,
                    );
                    setServiceCallForm({
                      ...serviceCallForm,
                      serviceTaker: event.target.value,
                      serviceTakerCompanyId: company ? String(company.id) : "",
                    });
                  }}
                  placeholder="Digite para localizar o tomador"
                />
                <datalist id="service-takers">
                  {companies
                    .filter((company) => company.isServiceTaker)
                    .map((company) => (
                      <option key={company.id} value={company.name} />
                    ))}
                </datalist>
              </Field>
              <Field label="Cliente">
                <Input
                  list="service-clients"
                  value={serviceCallForm.companyName}
                  onChange={(event) => {
                    const company = companies.find(
                      (item) => item.name === event.target.value,
                    );
                    setServiceCallForm({
                      ...serviceCallForm,
                      companyName: event.target.value,
                      companyId: company ? String(company.id) : "",
                      locationId: "",
                      locationCompanyId: "",
                      location: "",
                      saleId: "",
                    });
                  }}
                  placeholder="Digite para localizar o cliente"
                  required
                />
                <datalist id="service-clients">
                  {companies
                    .filter((company) => company.isClient)
                    .map((company) => (
                      <option key={company.id} value={company.name} />
                    ))}
                </datalist>
              </Field>
            </div>
            <div className="form-split">
              <Field label="Local do atendimento">
                <Input
                  list="service-location-companies"
                  value={serviceCallForm.location}
                  onChange={(event) => {
                    const location = companies.find(
                      (item) =>
                        item.isServiceLocation &&
                        item.name === event.target.value,
                    );
                    setServiceCallForm({
                      ...serviceCallForm,
                      location: event.target.value,
                      locationId: "",
                      locationCompanyId: location ? String(location.id) : "",
                    });
                  }}
                  placeholder="Digite para localizar o local cadastrado"
                />
                <datalist id="service-location-companies">
                  {companies
                    .filter((company) => company.isServiceLocation)
                    .map((company) => (
                      <option key={company.id} value={company.name} />
                    ))}
                </datalist>
              </Field>
              <Field label="Pedido / projeto (opcional)">
                <select
                  value={serviceCallForm.saleId}
                  onChange={(event) =>
                    setServiceCallForm({
                      ...serviceCallForm,
                      saleId: event.target.value,
                    })
                  }
                >
                  <option value="">Sem vínculo</option>
                  {sales
                    .filter(
                      (sale) =>
                        !serviceCallForm.companyId ||
                        sale.companyName ===
                          companies.find(
                            (company) =>
                              company.id === Number(serviceCallForm.companyId),
                          )?.name,
                    )
                    .map((sale) => (
                      <option key={sale.id} value={sale.id}>
                        {sale.number}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <div className="form-split">
              <Field label="Origem da solicitação">
                <select
                  value={serviceCallForm.requestOrigin}
                  onChange={(event) =>
                    setServiceCallForm({
                      ...serviceCallForm,
                      requestOrigin: event.target.value,
                    })
                  }
                >
                  <option value="email">E-mail</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telefone">Ligação</option>
                  <option value="presencial">Presencial</option>
                  <option value="outro">Outro</option>
                </select>
              </Field>
              <Field label="Solicitante / contato">
                <Input
                  value={serviceCallForm.contactName}
                  onChange={(event) =>
                    setServiceCallForm({
                      ...serviceCallForm,
                      contactName: event.target.value,
                    })
                  }
                  placeholder="Nome do solicitante"
                />
              </Field>
            </div>
            <div className="form-split">
              <Field label="Departamento">
                <Input
                  value={serviceCallForm.department}
                  onChange={(event) =>
                    setServiceCallForm({
                      ...serviceCallForm,
                      department: event.target.value,
                    })
                  }
                  placeholder="Setor que necessita do atendimento"
                />
              </Field>
              <Field label="Chamado interno do cliente">
                <Input
                  value={serviceCallForm.customerTicket}
                  onChange={(event) =>
                    setServiceCallForm({
                      ...serviceCallForm,
                      customerTicket: event.target.value,
                    })
                  }
                  placeholder="Número de controle do cliente"
                />
              </Field>
            </div>
            <Field label="Assunto">
              <Input
                value={serviceCallForm.subject}
                onChange={(event) =>
                  setServiceCallForm({
                    ...serviceCallForm,
                    subject: event.target.value,
                  })
                }
                placeholder="Ex.: Instabilidade na rede Wi-Fi"
                required
              />
            </Field>
            <Field label="Descrição do chamado">
              <Textarea
                value={serviceCallForm.description}
                onChange={(event) =>
                  setServiceCallForm({
                    ...serviceCallForm,
                    description: event.target.value,
                  })
                }
                placeholder="Descreva o problema, sintomas e informações importantes"
                required
              />
            </Field>
            <div className="form-split">
              <Field label="Tipo de serviço">
                <select
                  value={serviceCallForm.serviceType}
                  onChange={(event) =>
                    setServiceCallForm({
                      ...serviceCallForm,
                      serviceType: event.target.value,
                    })
                  }
                >
                  <option value="visita">Visita técnica</option>
                  <option value="remoto">Atendimento remoto</option>
                  <option value="instalacao">Instalação</option>
                  <option value="manutencao">Manutenção</option>
                  <option value="vistoria">Vistoria</option>
                </select>
              </Field>
              <Field label="Prioridade">
                <select
                  value={serviceCallForm.priority}
                  onChange={(event) =>
                    setServiceCallForm({
                      ...serviceCallForm,
                      priority: event.target.value,
                    })
                  }
                >
                  <option value="baixa">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </select>
              </Field>
            </div>
            <div className="form-split">
              <Field label="Técnico responsável">
                <select
                  value={serviceCallForm.technician}
                  onChange={(event) =>
                    setServiceCallForm({
                      ...serviceCallForm,
                      technician: event.target.value,
                    })
                  }
                >
                  <option value="">Aguardando Técnico</option>
                  {team
                    .filter((member) => member.active)
                    .map((member) => (
                      <option key={member.id} value={member.name}>
                        {member.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Agendamento">
                <Input
                  type="datetime-local"
                  value={serviceCallForm.scheduledAt}
                  onChange={(event) =>
                    setServiceCallForm({
                      ...serviceCallForm,
                      scheduledAt: event.target.value,
                    })
                  }
                />
              </Field>
            </div>
            {editingId &&
              editingServiceCall &&
              executionServiceCallStatuses.has(editingServiceCall.status) && (
                <ServiceCallEntriesEditor
                  callId={editingId}
                  catalog={catalog}
                  equipmentCatalog={equipmentCatalog}
                  priceTable={companies.find((company) => company.id === Number(serviceCallForm.companyId))?.preferredPriceTable ?? "padrao"}
                  technician={serviceCallForm.technician}
                />
              )}
            {editingId &&
              editingServiceCall &&
              executionServiceCallStatuses.has(editingServiceCall.status) && (
                <section className="service-execution-form">
                  <header>
                    <Wrench />
                    <div>
                      <strong>Execução técnica</strong>
                      <small>Preencha durante ou após o atendimento.</small>
                    </div>
                  </header>
                  <Field label="Serviço executado">
                    <Textarea
                      value={serviceCallForm.executedService}
                      onChange={(event) =>
                        setServiceCallForm({
                          ...serviceCallForm,
                          executedService: event.target.value,
                        })
                      }
                      placeholder="Descreva detalhadamente o diagnóstico e o serviço realizado"
                    />
                  </Field>
                  <label className="service-execution-check">
                    <input
                      type="checkbox"
                      checked={serviceCallForm.consumablesUsed}
                      onChange={(event) =>
                        setServiceCallForm({
                          ...serviceCallForm,
                          consumablesUsed: event.target.checked,
                        })
                      }
                    />
                    <span>Houve utilização de materiais de consumo</span>
                  </label>
                  {serviceCallForm.consumablesUsed && (
                    <Field label="Materiais de consumo">
                      <Textarea
                        value={serviceCallForm.consumablesDescription}
                        onChange={(event) =>
                          setServiceCallForm({
                            ...serviceCallForm,
                            consumablesDescription: event.target.value,
                          })
                        }
                        placeholder="Informe item, quantidade e unidade"
                      />
                    </Field>
                  )}
                  <label className="service-execution-check">
                    <input
                      type="checkbox"
                      checked={serviceCallForm.partsReplaced}
                      onChange={(event) =>
                        setServiceCallForm({
                          ...serviceCallForm,
                          partsReplaced: event.target.checked,
                        })
                      }
                    />
                    <span>Houve troca de equipamentos, partes ou peças</span>
                  </label>
                  {serviceCallForm.partsReplaced && (
                    <Field label="Equipamentos, partes e peças">
                      <Textarea
                        value={serviceCallForm.partsDescription}
                        onChange={(event) =>
                          setServiceCallForm({
                            ...serviceCallForm,
                            partsDescription: event.target.value,
                          })
                        }
                        placeholder="Informe equipamento, marca, modelo, patrimônio ou serial e quantidade"
                      />
                    </Field>
                  )}
                  <div className="form-split">
                    <Field label="Despesas do atendimento (R$)">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={serviceCallForm.expensesAmount}
                        onChange={(event) =>
                          setServiceCallForm({
                            ...serviceCallForm,
                            expensesAmount: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Descrição das despesas">
                      <Input
                        value={serviceCallForm.expensesDescription}
                        onChange={(event) =>
                          setServiceCallForm({
                            ...serviceCallForm,
                            expensesDescription: event.target.value,
                          })
                        }
                        placeholder="Pedágio, estacionamento, frete..."
                      />
                    </Field>
                  </div>
                  <div className="service-evidence">
                    <div>
                      <strong>Fotos e evidências</strong>
                      <small>
                        {
                          serviceCallFiles.filter(
                            (file) => file.serviceCallId === editingId,
                          ).length
                        }{" "}
                        foto(s) anexada(s)
                      </small>
                    </div>
                    <label className={saving ? "disabled" : ""}>
                      <Upload />
                      Adicionar fotos
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        disabled={saving}
                        onChange={(event) => {
                          Array.from(event.target.files ?? []).forEach((file) =>
                            uploadServiceCallPhoto(editingId, file),
                          );
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {serviceCallFiles.some(
                    (file) => file.serviceCallId === editingId,
                  ) && (
                    <div className="service-evidence-grid">
                      {serviceCallFiles
                        .filter((file) => file.serviceCallId === editingId)
                        .map((file) => (
                          <figure key={file.id}>
                            <a
                              href={`/api/service-call-files?id=${file.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                src={`/api/service-call-files?id=${file.id}`}
                                alt={file.name}
                              />
                            </a>
                            <figcaption>
                              <span>{file.name}</span>
                              <button
                                type="button"
                                onClick={() => deleteServiceCallPhoto(file)}
                                aria-label={`Excluir ${file.name}`}
                              >
                                <Trash2 />
                              </button>
                            </figcaption>
                          </figure>
                        ))}
                    </div>
                  )}
                </section>
              )}
            {editingId &&
              editingServiceCall &&
              reportServiceCallStatuses.has(editingServiceCall.status) && (
                <div className="service-report-actions">
                  <Button
                    type="button"
                    onClick={() =>
                      window.open(
                        `/relatorio-atendimento?id=${editingServiceCall.id}`,
                        "_blank",
                      )
                    }
                  >
                    <Printer /> Gerar PDF
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const link = `${window.location.origin}/relatorio-atendimento?id=${editingServiceCall.id}`;
                      window.location.href = `mailto:?subject=${encodeURIComponent(`Atendimento ${serviceCallNumber(editingServiceCall.number)} — TDK`)}&body=${encodeURIComponent(`Segue o relatório do atendimento ${serviceCallNumber(editingServiceCall.number)}.\n\n${link}`)}`;
                    }}
                  >
                    <Mail /> Enviar por e-mail
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const link = `${window.location.origin}/relatorio-atendimento?id=${editingServiceCall.id}`;
                      window.open(
                        `https://wa.me/?text=${encodeURIComponent(`Atendimento ${serviceCallNumber(editingServiceCall.number)} — TDK\n${link}`)}`,
                        "_blank",
                      );
                    }}
                  >
                    <Phone /> Enviar por WhatsApp
                  </Button>
                </div>
              )}
            <small className="service-call-rule-note">
              Chamados novos começam em Aberto. Para Acionar, complete tomador, local, contato, chamado interno e modalidade, além de definir o técnico. O agendamento passa a ser obrigatório ao Confirmar o atendimento. Ao marcar Pendente, informe obrigatoriamente o motivo da pendência. O departamento é opcional.
            </small>
            {error && (
              <div className="service-call-form-error" role="alert">
                <span>{error}</span>
                <button type="button" onClick={() => setError("")}>
                  Fechar
                </button>
              </div>
            )}
            <SaveButton saving={saving} disabled={!companies.length}>
              {editingId ? "Salvar informações" : "Cadastrar chamado"}
            </SaveButton>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "opportunity"}
        onOpenChange={(open) => {
          setDialog(open ? "opportunity" : null);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="dialog">
          <DialogHeader>
            <span className="dialog-kicker">CADASTRO COMERCIAL</span>
            <DialogTitle>
              {editingId ? "Editar oportunidade" : "Nova oportunidade"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Atualize os dados comerciais desta oportunidade."
                : "Registre uma oportunidade e vincule-a à empresa responsável."}
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
                <select
                  value={opportunityForm.probability}
                  onChange={(event) =>
                    setOpportunityForm({
                      ...opportunityForm,
                      probability: event.target.value,
                    })
                  }
                >
                  <option value="10">10%</option>
                  <option value="25">25%</option>
                  <option value="50">50%</option>
                  <option value="75">75%</option>
                  <option value="90">90%</option>
                  <option value="100">100%</option>
                </select>
              </Field>
              <Field label="Temperatura comercial">
                <select
                  value={opportunityForm.temperature}
                  onChange={(event) =>
                    setOpportunityForm({
                      ...opportunityForm,
                      temperature: event.target.value as
                        "cold" | "warm" | "hot",
                    })
                  }
                >
                  <option value="cold">Baixa</option>
                  <option value="warm">Média</option>
                  <option value="hot">Alta</option>
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
        onOpenChange={(open) => {
          setDialog(open ? "company" : null);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="dialog">
          <DialogHeader>
            <span className="dialog-kicker">CARTEIRA DE CLIENTES</span>
            <DialogTitle>
              {editingId ? "Editar empresa" : "Nova empresa"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Atualize os dados principais desta empresa."
                : "Cadastre os dados principais do cliente ou prospect."}
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
            <Field label="Classificação da empresa">
              <div className="company-role-options">
                {[
                  ["isClient", "Cliente"],
                  ["isServiceTaker", "Tomador"],
                  ["isServiceLocation", "Local de atendimento"],
                ].map(([field, label]) => (
                  <label key={field}>
                    <input
                      type="checkbox"
                      checked={Boolean(
                        companyForm[field as keyof typeof companyForm],
                      )}
                      onChange={(event) =>
                        setCompanyForm({
                          ...companyForm,
                          [field]: event.target.checked,
                        })
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <small>Uma empresa pode exercer mais de uma função.</small>
            </Field>
            <Field label="Logotipo">
              <div className="company-logo-field">
                {editingId &&
                  companies.find((item) => item.id === editingId)
                    ?.logoStorageKey && (
                    <img
                      src={`/api/company-logos?id=${editingId}`}
                      alt="Logotipo atual"
                    />
                  )}
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(event) =>
                    setCompanyLogoFile(event.target.files?.[0] ?? null)
                  }
                />
              </div>
              <small>PNG, JPG, WebP ou SVG, com até 5 MB.</small>
            </Field>
            <Field label="Tabela de preços preferencial">
              <select
                value={companyForm.preferredPriceTable}
                onChange={(event) =>
                  setCompanyForm({
                    ...companyForm,
                    preferredPriceTable: event.target.value,
                  })
                }
              >
                <option value="competitiva">Competitiva</option>
                <option value="padrao">Padrão</option>
                <option value="valor">Valor agregado</option>
              </select>
              <small>
                Será selecionada automaticamente nas novas propostas deste
                cliente.
              </small>
            </Field>
            <SaveButton saving={saving}>
              {editingId ? "Salvar alterações" : "Cadastrar empresa"}
            </SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "contact"}
        onOpenChange={(open) => {
          setDialog(open ? "contact" : null);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="dialog">
          <DialogHeader>
            <span className="dialog-kicker">RELACIONAMENTO</span>
            <DialogTitle>
              {editingId ? "Editar contato" : "Novo contato"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Atualize os dados e o vínculo deste contato."
                : "Associe uma pessoa de contato à empresa correspondente."}
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
      <Dialog
        open={dialog === "activity"}
        onOpenChange={(open) => setDialog(open ? "activity" : null)}
      >
        <DialogContent className="dialog">
          <DialogHeader>
            <span className="dialog-kicker">AGENDA COMERCIAL</span>
            <DialogTitle>Nova atividade</DialogTitle>
            <DialogDescription>
              Registre o próximo passo de uma oportunidade.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createActivity} className="form">
            <Field label="Oportunidade">
              <select
                value={activityForm.opportunityId}
                onChange={(event) =>
                  setActivityForm({
                    ...activityForm,
                    opportunityId: event.target.value,
                  })
                }
                required
              >
                <option value="">Selecione uma oportunidade</option>
                {items
                  .filter((item) => item.stage !== "ganho")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} — {item.company}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Tipo de atividade">
              <select
                value={activityForm.type}
                onChange={(event) =>
                  setActivityForm({ ...activityForm, type: event.target.value })
                }
              >
                <option value="retorno">Retorno ao cliente</option>
                <option value="ligacao">Ligação</option>
                <option value="reuniao">Reunião</option>
                <option value="visita">Visita técnica</option>
                <option value="proposta">Envio de proposta</option>
                <option value="outro">Outro</option>
              </select>
            </Field>
            <Field label="Descrição">
              <Textarea
                value={activityForm.description}
                onChange={(event) =>
                  setActivityForm({
                    ...activityForm,
                    description: event.target.value,
                  })
                }
                placeholder="Ex.: Confirmar escopo e agendar apresentação"
                required
              />
            </Field>
            <Field label="Prazo">
              <Input
                type="datetime-local"
                value={activityForm.dueAt}
                onChange={(event) =>
                  setActivityForm({
                    ...activityForm,
                    dueAt: event.target.value,
                  })
                }
              />
            </Field>
            <SaveButton
              saving={saving}
              disabled={!items.some((item) => item.stage !== "ganho")}
            >
              Cadastrar atividade
            </SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "proposal"}
        onOpenChange={(open) => {
          setDialog(open ? "proposal" : null);
          if (!open) setEditingProposalId(null);
        }}
      >
        <DialogContent className="dialog proposal-dialog">
          <DialogHeader>
            <span className="dialog-kicker">PROPOSTA COMERCIAL</span>
            <DialogTitle>
              {editingProposalId ? "Editar proposta" : "Nova proposta"}
            </DialogTitle>
            <DialogDescription>
              {editingProposalId
                ? "Atualize os itens, valores e condições comerciais."
                : "Componha materiais, serviços e condições comerciais."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createProposal} className="form proposal-form">
            <div className="proposal-top">
              <Field label="Oportunidade (opcional)">
                <select
                  value={proposalForm.opportunityId}
                  onChange={(event) => {
                    const opportunity = items.find(
                      (item) => item.id === Number(event.target.value),
                    );
                    const company = companies.find(
                      (entry) => entry.id === opportunity?.companyId,
                    );
                    const priceTable =
                      company?.preferredPriceTable ?? proposalForm.priceTable;
                    setProposalForm((current) => ({
                      ...current,
                      opportunityId: event.target.value,
                      companyId: opportunity?.companyId
                        ? String(opportunity.companyId)
                        : current.companyId,
                      priceTable,
                      items: current.items.map((entry) => {
                        const catalogItem = catalog.find(
                          (item) => item.id === entry.catalogId,
                        );
                        return catalogItem
                          ? {
                              ...entry,
                              unitPrice: catalogPrice(catalogItem, priceTable),
                            }
                          : entry;
                      }),
                    }));
                  }}
                >
                  <option value="">Proposta direta</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} — {item.company}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Empresa">
                <select
                  value={proposalForm.companyId}
                  onChange={(event) => {
                    const company = companies.find(
                      (item) => item.id === Number(event.target.value),
                    );
                    const priceTable =
                      company?.preferredPriceTable ?? proposalForm.priceTable;
                    setProposalForm((current) => ({
                      ...current,
                      companyId: event.target.value,
                      opportunityId: "",
                      priceTable,
                      items: current.items.map((entry) => {
                        const catalogItem = catalog.find(
                          (item) => item.id === entry.catalogId,
                        );
                        return catalogItem
                          ? {
                              ...entry,
                              unitPrice: catalogPrice(catalogItem, priceTable),
                            }
                          : entry;
                      }),
                    }));
                  }}
                  required={!proposalForm.opportunityId}
                >
                  <option value="">Selecione</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tabela de preços">
                <select
                  value={proposalForm.priceTable}
                  onChange={(event) => {
                    const priceTable = event.target.value;
                    setProposalForm((current) => ({
                      ...current,
                      priceTable,
                      items: current.items.map((entry) => {
                        const catalogItem = catalog.find(
                          (item) => item.id === entry.catalogId,
                        );
                        return catalogItem
                          ? {
                              ...entry,
                              unitPrice: catalogPrice(catalogItem, priceTable),
                            }
                          : entry;
                      }),
                    }));
                  }}
                >
                  <option value="competitiva">Competitiva</option>
                  <option value="padrao">Padrão</option>
                  <option value="valor">Valor agregado</option>
                </select>
              </Field>
              <Field label="Validade">
                <Input
                  type="date"
                  value={proposalForm.validUntil}
                  onChange={(event) =>
                    setProposalForm({
                      ...proposalForm,
                      validUntil: event.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <div className="proposal-reference">
              <Field label="Pedido/OC do cliente">
                <Input
                  value={proposalForm.customerOrder}
                  onChange={(event) =>
                    setProposalForm({
                      ...proposalForm,
                      customerOrder: event.target.value,
                    })
                  }
                  placeholder="Número ou referência"
                />
              </Field>
              <Field label="Solicitante / responsável">
                <Input
                  value={proposalForm.requester}
                  onChange={(event) =>
                    setProposalForm({
                      ...proposalForm,
                      requester: event.target.value,
                    })
                  }
                  placeholder="Nome do solicitante"
                />
              </Field>
            </div>
            <div className="proposal-items-head">
              <strong>Itens da proposta</strong>
              <button
                type="button"
                onClick={() =>
                  setProposalForm({
                    ...proposalForm,
                    items: [
                      ...proposalForm.items,
                      {
                        category: "material",
                        description: "",
                        quantity: 1,
                        unitCost: "",
                        unitPrice: "",
                      },
                    ],
                  })
                }
              >
                <Plus /> Adicionar item
              </button>
            </div>
            {catalog.length ? (
              <Field label="Buscar no catálogo">
                <CatalogPicker
                  catalog={catalog}
                  priceTable={proposalForm.priceTable}
                  onSelect={addCatalogItem}
                />
              </Field>
            ) : null}
            <div className="proposal-items">
              {proposalForm.items.map((item, index) => (
                <div className="proposal-item" key={index}>
                  <select
                    value={item.category}
                    aria-label="Categoria"
                    onChange={(event) => {
                      const next = [...proposalForm.items];
                      next[index] = {
                        ...item,
                        category: event.target.value as "material" | "servico",
                      };
                      setProposalForm({ ...proposalForm, items: next });
                    }}
                  >
                    <option value="material">Material</option>
                    <option value="servico">Serviço</option>
                  </select>
                  <Input
                    value={item.description}
                    aria-label="Descrição"
                    placeholder="Descrição do item"
                    onChange={(event) => {
                      const next = [...proposalForm.items];
                      next[index] = {
                        ...item,
                        description: event.target.value,
                      };
                      setProposalForm({ ...proposalForm, items: next });
                    }}
                  />
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={item.quantity}
                    aria-label="Quantidade"
                    placeholder="Qtd."
                    onChange={(event) => {
                      const next = [...proposalForm.items];
                      next[index] = { ...item, quantity: event.target.value };
                      setProposalForm({ ...proposalForm, items: next });
                    }}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitCost}
                    aria-label="Custo unitário"
                    placeholder="Custo unit."
                    onChange={(event) => {
                      const next = [...proposalForm.items];
                      next[index] = { ...item, unitCost: event.target.value };
                      setProposalForm({ ...proposalForm, items: next });
                    }}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    aria-label="Valor unitário"
                    placeholder="Valor unit."
                    onChange={(event) => {
                      const next = [...proposalForm.items];
                      next[index] = { ...item, unitPrice: event.target.value };
                      setProposalForm({ ...proposalForm, items: next });
                    }}
                  />
                  <strong>
                    {money(Number(item.quantity) * Number(item.unitPrice || 0))}
                  </strong>
                  <button
                    type="button"
                    aria-label="Remover item"
                    disabled={proposalForm.items.length === 1}
                    onClick={() =>
                      setProposalForm({
                        ...proposalForm,
                        items: proposalForm.items.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
            <div className="proposal-bottom">
              <Field label="Observações">
                <Textarea
                  value={proposalForm.notes}
                  onChange={(event) =>
                    setProposalForm({
                      ...proposalForm,
                      notes: event.target.value,
                    })
                  }
                  placeholder="Condições, prazo de entrega ou escopo"
                />
              </Field>
              <div>
                <Field label="Desconto (R$)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={proposalForm.discount}
                    onChange={(event) =>
                      setProposalForm({
                        ...proposalForm,
                        discount: event.target.value,
                      })
                    }
                  />
                </Field>
                <div className="proposal-total">
                  <span>Total</span>
                  <strong>{money(proposalNet)}</strong>
                </div>
                <div
                  className={`proposal-margin ${proposalProfit < 0 ? "danger" : proposalMargin < 10 ? "warning" : ""}`}
                >
                  <span>
                    Custo total <strong>{money(proposalCost)}</strong>
                  </span>
                  <span>
                    Resultado <strong>{money(proposalProfit)}</strong>
                  </span>
                  <b>
                    Margem <strong>{proposalMargin.toFixed(1)}%</strong>
                  </b>
                  {proposalProfit < 0 && (
                    <small>Alerta: proposta abaixo do custo</small>
                  )}
                </div>
              </div>
            </div>
            <SaveButton saving={saving} disabled={!items.length}>
              {editingProposalId ? "Salvar alterações" : "Criar proposta"}
            </SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "catalog"}
        onOpenChange={(open) => {
          setDialog(open ? "catalog" : null);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="dialog catalog-dialog">
          <DialogHeader>
            <span className="dialog-kicker">CATÁLOGO COMERCIAL</span>
            <DialogTitle>
              {editingId ? "Editar item" : "Novo produto ou serviço"}
            </DialogTitle>
            <DialogDescription>
              Cadastre o custo e os preços de cada estratégia comercial.
            </DialogDescription>
          </DialogHeader>
          <form className="form" onSubmit={saveCatalog}>
            <div className="form-split">
              <Field label="Tipo">
                <select
                  value={catalogForm.category}
                  onChange={(event) =>
                    setCatalogForm({
                      ...catalogForm,
                      category: event.target.value as CatalogCategory,
                    })
                  }
                >
                  <option value="material">Material</option>
                  <option value="servico">Serviço</option>
                </select>
              </Field>
              <Field label="Código">
                <Input
                  value={catalogForm.code}
                  disabled
                  readOnly
                  placeholder="Gerado automaticamente · PS-0001, PS-0002..."
                  title="Código gerado automaticamente pelo TDK Manager"
                />
              </Field>
            </div>
            <Field label="Descrição">
              <Input
                value={catalogForm.description}
                onChange={(event) =>
                  setCatalogForm({
                    ...catalogForm,
                    description: event.target.value,
                  })
                }
                required
                placeholder="Nome do produto ou serviço"
              />
            </Field>
            <div className="form-split">
              <Field label="Unidade">
                <Input
                  value={catalogForm.unit}
                  onChange={(event) =>
                    setCatalogForm({ ...catalogForm, unit: event.target.value })
                  }
                />
              </Field>
              <Field label="Custo (R$)">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={catalogForm.cost}
                  onChange={(event) =>
                    setCatalogForm({ ...catalogForm, cost: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="catalog-price-fields">
              <Field label="Competitiva">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={catalogForm.competitivePrice}
                  onChange={(event) =>
                    setCatalogForm({
                      ...catalogForm,
                      competitivePrice: event.target.value,
                    })
                  }
                  required
                />
              </Field>
              <Field label="Padrão">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={catalogForm.standardPrice}
                  onChange={(event) =>
                    setCatalogForm({
                      ...catalogForm,
                      standardPrice: event.target.value,
                    })
                  }
                  required
                />
              </Field>
              <Field label="Valor agregado">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={catalogForm.valuePrice}
                  onChange={(event) =>
                    setCatalogForm({
                      ...catalogForm,
                      valuePrice: event.target.value,
                    })
                  }
                  required
                />
              </Field>
            </div>
            <SaveButton saving={saving}>
              {editingId ? "Salvar alterações" : "Cadastrar item"}
            </SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "equipment"}
        onOpenChange={(open) => { setDialog(open ? "equipment" : null); if (!open) setEditingId(null); }}
      >
        <DialogContent className="dialog catalog-dialog">
          <DialogHeader>
            <span className="dialog-kicker">EQUIPAMENTOS E PEÇAS</span>
            <DialogTitle>{editingId ? "Editar equipamento ou peça" : "Novo equipamento ou peça"}</DialogTitle>
            <DialogDescription>Cadastre separadamente os itens utilizados ou substituídos nos atendimentos.</DialogDescription>
          </DialogHeader>
          <form className="form" onSubmit={saveEquipment}>
            <div className="form-split">
              <Field label="Código"><Input value={equipmentForm.code} disabled readOnly placeholder="Gerado automaticamente · EQ-0001, EQ-0002..." title="Código gerado automaticamente pelo TDK Manager" /></Field>
              <Field label="Unidade"><Input value={equipmentForm.unit} onChange={(e) => setEquipmentForm({...equipmentForm, unit:e.target.value})} /></Field>
            </div>
            <Field label="Descrição"><Input required value={equipmentForm.description} onChange={(e) => setEquipmentForm({...equipmentForm, description:e.target.value})} placeholder="Nome do equipamento, parte ou peça" /></Field>
            <div className="form-split">
              <Field label="Marca"><Input value={equipmentForm.brand} onChange={(e) => setEquipmentForm({...equipmentForm, brand:e.target.value})} /></Field>
              <Field label="Modelo"><Input value={equipmentForm.model} onChange={(e) => setEquipmentForm({...equipmentForm, model:e.target.value})} /></Field>
            </div>
            <div className="form-split">
              <ScanCodeField label="Número serial" value={equipmentForm.serialNumber} onChange={(serialNumber) => setEquipmentForm({...equipmentForm, serialNumber})} />
              <ScanCodeField label="Número do patrimônio" value={equipmentForm.inventoryNumber} onChange={(inventoryNumber) => setEquipmentForm({...equipmentForm, inventoryNumber})} />
            </div>
            <Field label="Custo (R$)"><Input type="number" min="0" step="0.01" value={equipmentForm.cost} onChange={(e) => setEquipmentForm({...equipmentForm, cost:e.target.value})} /></Field>
            <SaveButton saving={saving}>{editingId ? "Salvar alterações" : "Cadastrar equipamento"}</SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "payable"}
        onOpenChange={(open) => setDialog(open ? "payable" : null)}
      >
        <DialogContent className="dialog payable-dialog">
          <DialogHeader>
            <span className="dialog-kicker">FINANCEIRO</span>
            <DialogTitle>Nova conta a pagar</DialogTitle>
            <DialogDescription>
              Cadastre a despesa e gere os vencimentos automaticamente.
            </DialogDescription>
          </DialogHeader>
          <form className="form" onSubmit={createPayable}>
            <Field label="Fornecedor">
              <Input
                list="supplier-options"
                value={payableForm.supplierName}
                onChange={(event) =>
                  setPayableForm({
                    ...payableForm,
                    supplierName: event.target.value,
                  })
                }
                placeholder="Digite ou selecione o fornecedor"
                required
              />
              <datalist id="supplier-options">
                {suppliers.map((item) => (
                  <option value={item.name} key={item.id} />
                ))}
              </datalist>
            </Field>
            <div className="form-split">
              <Field label="CNPJ / CPF (novo fornecedor)">
                <Input
                  value={payableForm.supplierDocument}
                  onChange={(event) =>
                    setPayableForm({
                      ...payableForm,
                      supplierDocument: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Telefone">
                <Input
                  value={payableForm.supplierPhone}
                  onChange={(event) =>
                    setPayableForm({
                      ...payableForm,
                      supplierPhone: event.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <Field label="E-mail">
              <Input
                type="email"
                value={payableForm.supplierEmail}
                onChange={(event) =>
                  setPayableForm({
                    ...payableForm,
                    supplierEmail: event.target.value,
                  })
                }
              />
            </Field>
            <div className="form-split">
              <Field label="Cliente (opcional)">
                <select
                  value={payableForm.companyId}
                  onChange={(event) =>
                    setPayableForm({
                      ...payableForm,
                      companyId: event.target.value,
                    })
                  }
                >
                  <option value="">Despesa interna / sem cliente</option>
                  {companies.map((company) => (
                    <option value={company.id} key={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Projeto (opcional)">
                <Input
                  value={payableForm.project}
                  onChange={(event) =>
                    setPayableForm({
                      ...payableForm,
                      project: event.target.value,
                    })
                  }
                  placeholder="Nome ou código do projeto"
                />
              </Field>
            </div>
            <Field label="Descrição da despesa">
              <Input
                value={payableForm.description}
                onChange={(event) =>
                  setPayableForm({
                    ...payableForm,
                    description: event.target.value,
                  })
                }
                placeholder="Ex.: Compra de equipamentos"
                required
              />
            </Field>
            <div className="form-split">
              <Field label="Categoria">
                <select
                  value={payableForm.category}
                  onChange={(event) =>
                    setPayableForm({
                      ...payableForm,
                      category: event.target.value,
                    })
                  }
                >
                  <option value="fornecedor">Fornecedor / materiais</option>
                  <option value="servicos">Serviços contratados</option>
                  <option value="impostos">Impostos e taxas</option>
                  <option value="pessoal">Pessoal</option>
                  <option value="estrutura">Estrutura e escritório</option>
                  <option value="outros">Outros</option>
                </select>
              </Field>
              <Field label="Documento / referência">
                <Input
                  value={payableForm.reference}
                  onChange={(event) =>
                    setPayableForm({
                      ...payableForm,
                      reference: event.target.value,
                    })
                  }
                  placeholder="NF, boleto ou pedido"
                />
              </Field>
            </div>
            <div className="payable-form-values">
              <Field label="Valor total (R$)">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payableForm.amount}
                  onChange={(event) =>
                    setPayableForm({
                      ...payableForm,
                      amount: event.target.value,
                    })
                  }
                  required
                />
              </Field>
              <Field label="Parcelas">
                <Input
                  type="number"
                  min="1"
                  max="120"
                  value={payableForm.installments}
                  onChange={(event) =>
                    setPayableForm({
                      ...payableForm,
                      installments: event.target.value,
                    })
                  }
                  required
                />
              </Field>
              <Field label="Primeiro vencimento">
                <Input
                  type="date"
                  value={payableForm.dueDate}
                  onChange={(event) =>
                    setPayableForm({
                      ...payableForm,
                      dueDate: event.target.value,
                    })
                  }
                  required
                />
              </Field>
            </div>
            <SaveButton saving={saving}>Cadastrar conta</SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "goal"}
        onOpenChange={(open) => {
          setDialog(open ? "goal" : null);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="dialog">
          <DialogHeader>
            <span className="dialog-kicker">METAS COMERCIAIS</span>
            <DialogTitle>{editingId ? "Editar meta" : "Nova meta"}</DialogTitle>
            <DialogDescription>
              Defina o objetivo e o período de acompanhamento.
            </DialogDescription>
          </DialogHeader>
          <form className="form" onSubmit={saveGoal}>
            <Field label="Nome da meta">
              <Input
                value={goalForm.name}
                onChange={(event) =>
                  setGoalForm({ ...goalForm, name: event.target.value })
                }
                placeholder="Ex.: Meta de vendas anual"
                required
              />
            </Field>
            <div className="form-split">
              <Field label="Indicador">
                <select
                  value={goalForm.type}
                  onChange={(event) =>
                    setGoalForm({ ...goalForm, type: event.target.value })
                  }
                >
                  <option value="sales">Vendas realizadas</option>
                  <option value="approved_proposals">
                    Propostas aprovadas
                  </option>
                  <option value="received">Valores recebidos</option>
                  <option value="margin">Resultado bruto</option>
                </select>
              </Field>
              <Field label="Valor da meta (R$)">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={goalForm.target}
                  onChange={(event) =>
                    setGoalForm({ ...goalForm, target: event.target.value })
                  }
                  required
                />
              </Field>
            </div>
            <div className="form-split">
              <Field label="Início">
                <Input
                  type="date"
                  value={goalForm.startsAt}
                  onChange={(event) =>
                    setGoalForm({ ...goalForm, startsAt: event.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Término">
                <Input
                  type="date"
                  value={goalForm.endsAt}
                  onChange={(event) =>
                    setGoalForm({ ...goalForm, endsAt: event.target.value })
                  }
                  required
                />
              </Field>
            </div>
            {editingId && (
              <label className="member-active">
                <input
                  type="checkbox"
                  checked={goalForm.active}
                  onChange={(event) =>
                    setGoalForm({ ...goalForm, active: event.target.checked })
                  }
                />
                <span>Meta ativa</span>
              </label>
            )}
            <SaveButton saving={saving}>
              {editingId ? "Salvar alterações" : "Cadastrar meta"}
            </SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "member"}
        onOpenChange={(open) => {
          setDialog(open ? "member" : null);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="dialog member-dialog">
          <DialogHeader>
            <span className="dialog-kicker">EQUIPE E PERMISSÕES</span>
            <DialogTitle>
              {editingId ? "Editar usuário" : "Novo usuário"}
            </DialogTitle>
            <DialogDescription>
              Defina o perfil e as áreas que esta pessoa poderá utilizar.
            </DialogDescription>
          </DialogHeader>
          <form className="form" onSubmit={saveMember}>
            <div className="form-split">
              <Field label="Nome completo">
                <Input
                  value={memberForm.name}
                  onChange={(event) =>
                    setMemberForm({ ...memberForm, name: event.target.value })
                  }
                  required
                />
              </Field>
              <Field label="E-mail de acesso">
                <Input
                  type="email"
                  value={memberForm.email}
                  disabled={Boolean(editingId)}
                  onChange={(event) =>
                    setMemberForm({ ...memberForm, email: event.target.value })
                  }
                  required
                />
              </Field>
            </div>
            <div className="form-split">
              <Field label="Cargo / função">
                <Input
                  value={memberForm.jobTitle}
                  onChange={(event) =>
                    setMemberForm({
                      ...memberForm,
                      jobTitle: event.target.value,
                    })
                  }
                  placeholder="Ex.: Consultor comercial"
                />
              </Field>
              <Field label="Perfil">
                <select
                  value={memberForm.role}
                  onChange={(event) => {
                    const role = event.target.value;
                    setMemberForm({
                      ...memberForm,
                      role,
                      permissions:
                        role === "admin"
                          ? [
                              "crm",
                              "proposals",
                              "sales",
                              "billing",
                              "receivables",
                              "payables",
                              "reports",
                              "settings",
                            ]
                          : memberForm.permissions,
                    });
                  }}
                >
                  <option value="admin">Administrador</option>
                  <option value="manager">Gestor</option>
                  <option value="seller">Comercial</option>
                  <option value="finance">Financeiro</option>
                  <option value="viewer">Somente consulta</option>
                </select>
              </Field>
            </div>
            <Field label="Permissões por área">
              <div className="permission-grid">
                {[
                  ["crm", "CRM e atividades"],
                  ["proposals", "Propostas e catálogo"],
                  ["sales", "Pedidos e vendas"],
                  ["billing", "Faturamento"],
                  ["receivables", "Contas a receber"],
                  ["payables", "Contas a pagar"],
                  ["reports", "Relatórios"],
                  ["settings", "Configurações"],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className={memberForm.role === "admin" ? "locked" : ""}
                  >
                    <input
                      type="checkbox"
                      checked={
                        memberForm.role === "admin" ||
                        memberForm.permissions.includes(value)
                      }
                      disabled={memberForm.role === "admin"}
                      onChange={(event) =>
                        setMemberForm({
                          ...memberForm,
                          permissions: event.target.checked
                            ? [...memberForm.permissions, value]
                            : memberForm.permissions.filter(
                                (item) => item !== value,
                              ),
                        })
                      }
                    />
                    <span>
                      <CheckCircle2 />
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </Field>
            {editingId && (
              <label className="member-active">
                <input
                  type="checkbox"
                  checked={memberForm.active}
                  disabled={editingId === currentUserId}
                  onChange={(event) =>
                    setMemberForm({
                      ...memberForm,
                      active: event.target.checked,
                    })
                  }
                />
                <span>Usuário ativo</span>
              </label>
            )}
            <SaveButton saving={saving}>
              {editingId ? "Salvar alterações" : "Cadastrar usuário"}
            </SaveButton>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.name}” será removido permanentemente. Esta ação não pode ser desfeita.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="delete-button"
              onClick={confirmDelete}
              disabled={saving}
            >
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
function ScanCodeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const scanImage = async (file?: File) => {
    if (!file) return;
    try {
      const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: ImageBitmap) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      if (!Detector) throw new Error("A leitura pela câmera não está disponível neste navegador.");
      setMessage("Lendo código…");
      const image = await createImageBitmap(file);
      const results = await new Detector({ formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "data_matrix"] }).detect(image);
      image.close();
      if (!results[0]?.rawValue) throw new Error("Nenhum código foi identificado. Tente aproximar a câmera.");
      onChange(results[0].rawValue);
      setMessage("Código lido com sucesso.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Não foi possível ler o código.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const scanNfc = async () => {
    try {
      const Reader = (window as unknown as { NDEFReader?: new () => { scan: () => Promise<void>; addEventListener: (type: string, listener: (event: { serialNumber?: string; message?: { records?: Array<{ data?: DataView }> } }) => void, options?: { once?: boolean }) => void } }).NDEFReader;
      if (!Reader) throw new Error("A leitura NFC não está disponível neste aparelho ou navegador.");
      const reader = new Reader();
      await reader.scan();
      setMessage("Aproxime a etiqueta NFC do aparelho…");
      reader.addEventListener("reading", (event) => {
        const record = event.message?.records?.[0];
        const decoded = record?.data ? new TextDecoder().decode(record.data) : "";
        const result = decoded || event.serialNumber || "";
        if (result) { onChange(result); setMessage("NFC lido com sucesso."); }
      }, { once: true });
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Não foi possível ler a etiqueta NFC.");
    }
  };
  return <div className="scan-code-field">
    <Label>{label}</Label>
    <div><Input value={value} onChange={(event) => onChange(event.target.value)} /><button type="button" onClick={() => fileRef.current?.click()}>Câmera / QR</button><button type="button" onClick={scanNfc}>NFC</button></div>
    <input ref={fileRef} className="scan-code-file" type="file" accept="image/*" capture="environment" onChange={(event) => scanImage(event.target.files?.[0])} />
    {message && <small>{message}</small>}
  </div>;
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
    <Button type="submit" className="save-button" disabled={saving || disabled}>
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
                        <button
                          aria-label={`Editar ${card.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            edit(card);
                          }}
                        >
                          <Pencil />
                        </button>
                        <button
                          className="danger"
                          aria-label={`Excluir ${card.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            remove(card);
                          }}
                        >
                          <Trash2 />
                        </button>
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
function CompanyLocations({
  company,
  locations,
  onChange,
}: {
  company: Company;
  locations: ServiceLocation[];
  onChange: React.Dispatch<React.SetStateAction<ServiceLocation[]>>;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [address, setAddress] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const add = async () => {
    if (!name.trim() || !address.trim())
      return setMessage("Informe o nome e o endereço.");
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/service-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, name, address }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onChange((items) =>
        [...items, data.location].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setName("");
      setAddress("");
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Não foi possível cadastrar o local.",
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: number) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/service-locations?id=${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onChange((items) => items.filter((item) => item.id !== id));
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Não foi possível excluir o local.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="company-locations">
      <button type="button" onClick={() => setOpen((value) => !value)}>
        <span>{locations.length} local(is) de atendimento</span>
        <ChevronDown className={open ? "open" : ""} />
      </button>
      {open && (
        <div className="company-locations-body">
          {locations.map((location) => (
            <article key={location.id}>
              <div>
                <strong>{location.name}</strong>
                <small>{location.address}</small>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(location.id)}
                aria-label={`Excluir ${location.name}`}
              >
                <Trash2 />
              </button>
            </article>
          ))}
          {!locations.length && <p>Nenhum local cadastrado.</p>}
          <div className="company-location-form">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome da unidade / local"
            />
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Endereço completo"
            />
            <Button type="button" disabled={busy} onClick={add}>
              <Plus />
              Adicionar local
            </Button>
          </div>
          {message && (
            <small className="company-location-error">{message}</small>
          )}
        </div>
      )}
    </div>
  );
}

function Companies({
  companies,
  contacts,
  opportunities,
  locations,
  onLocationsChange,
  add,
  edit,
  remove,
}: {
  companies: Company[];
  contacts: ContactRecord[];
  opportunities: Opportunity[];
  locations: ServiceLocation[];
  onLocationsChange: React.Dispatch<React.SetStateAction<ServiceLocation[]>>;
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
              {company.logoStorageKey ? (
                <span className="company-logo">
                  <img
                    src={`/api/company-logos?id=${company.id}`}
                    alt={`Logo ${company.name}`}
                  />
                </span>
              ) : (
                <span>
                  <Building2 />
                </span>
              )}
              <div className="company-meta">
                <small>{company.segment || "Segmento não informado"}</small>
                <span className="record-actions">
                  <button
                    aria-label={`Editar ${company.name}`}
                    onClick={() => edit(company)}
                  >
                    <Pencil />
                  </button>
                  <button
                    className="danger"
                    aria-label={`Excluir ${company.name}`}
                    onClick={() => remove(company)}
                  >
                    <Trash2 />
                  </button>
                </span>
              </div>
            </div>
            <h2>{company.name}</h2>
            <p>{company.document || "Documento não informado"}</p>
            <div className="company-role-badges">
              {company.isClient && <span>Cliente</span>}
              {company.isServiceTaker && <span>Tomador</span>}
              {company.isServiceLocation && <span>Local de atendimento</span>}
            </div>
            <div className="company-stats">
              <span>
                <strong>{companyContacts}</strong> contatos
              </span>
              <span>
                <strong>{money(value)}</strong> pipeline
              </span>
            </div>
            <CompanyLocations
              company={company}
              locations={locations.filter(
                (item) => item.companyId === company.id,
              )}
              onChange={onLocationsChange}
            />
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
            <button
              aria-label={`Editar ${contact.name}`}
              onClick={() => edit(contact)}
            >
              <Pencil />
            </button>
            <button
              className="danger"
              aria-label={`Excluir ${contact.name}`}
              onClick={() => remove(contact)}
            >
              <Trash2 />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
function Goals({
  goals,
  sales,
  proposals,
  receivables,
  add,
  edit,
  remove,
}: {
  goals: GoalRecord[];
  sales: SaleRecord[];
  proposals: ProposalRecord[];
  receivables: ReceivableRecord[];
  add: () => void;
  edit: (goal: GoalRecord) => void;
  remove: (goal: GoalRecord) => void;
}) {
  const [showInactive, setShowInactive] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const labels: Record<string, string> = {
    sales: "Vendas realizadas",
    approved_proposals: "Propostas aprovadas",
    received: "Valores recebidos",
    margin: "Resultado bruto",
  };
  const current = (goal: GoalRecord) =>
    goal.type === "sales"
      ? sales
          .filter(
            (item) =>
              item.createdAt.slice(0, 10) >= goal.startsAt &&
              item.createdAt.slice(0, 10) <= goal.endsAt,
          )
          .reduce((sum, item) => sum + item.total, 0)
      : goal.type === "approved_proposals"
        ? proposals
            .filter(
              (item) =>
                item.status === "aprovada" &&
                item.createdAt.slice(0, 10) >= goal.startsAt &&
                item.createdAt.slice(0, 10) <= goal.endsAt,
            )
            .reduce((sum, item) => sum + item.total, 0)
        : goal.type === "received"
          ? receivables
              .filter(
                (item) =>
                  item.paymentDate &&
                  item.paymentDate >= goal.startsAt &&
                  item.paymentDate <= goal.endsAt,
              )
              .reduce((sum, item) => sum + item.receivedAmount, 0)
          : sales
              .filter(
                (item) =>
                  item.createdAt.slice(0, 10) >= goal.startsAt &&
                  item.createdAt.slice(0, 10) <= goal.endsAt,
              )
              .reduce((sum, item) => sum + item.total - item.cost, 0);
  const visible = goals.filter((goal) => showInactive || goal.active);
  if (!goals.length)
    return (
      <Empty
        icon={<Target />}
        title="Nenhuma meta cadastrada"
        text="Crie objetivos comerciais e acompanhe o progresso pelos dados do sistema."
        action="Cadastrar primeira meta"
        onClick={add}
      />
    );
  return (
    <div className="goals-page">
      <div className="goals-toolbar">
        <span>
          <strong>{goals.filter((goal) => goal.active).length}</strong> metas
          ativas
        </span>
        <label>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          Mostrar inativas
        </label>
      </div>
      <div className="goals-grid">
        {visible.map((goal) => {
          const value = current(goal),
            percent = Math.min(100, (value / goal.target) * 100),
            status = !goal.active
              ? "inactive"
              : value >= goal.target
                ? "done"
                : goal.endsAt < today
                  ? "late"
                  : "running";
          return (
            <article className={`goal-card ${status}`} key={goal.id}>
              <header>
                <span>
                  <Target />
                </span>
                <div>
                  <small>{labels[goal.type] ?? goal.type}</small>
                  <h2>{goal.name}</h2>
                </div>
                <b>
                  {status === "done"
                    ? "Atingida"
                    : status === "late"
                      ? "Encerrada"
                      : status === "inactive"
                        ? "Inativa"
                        : "Em andamento"}
                </b>
              </header>
              <div className="goal-values">
                <span>
                  Realizado<strong>{money(value)}</strong>
                </span>
                <span>
                  Meta<strong>{money(goal.target)}</strong>
                </span>
                <span>
                  Falta
                  <strong>{money(Math.max(0, goal.target - value))}</strong>
                </span>
              </div>
              <div className="goal-progress">
                <i>
                  <b style={{ width: `${percent}%` }} />
                </i>
                <span>{percent.toFixed(1)}%</span>
              </div>
              <p>
                <CalendarClock />
                {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
                  new Date(`${goal.startsAt}T12:00:00Z`),
                )}{" "}
                a{" "}
                {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
                  new Date(`${goal.endsAt}T12:00:00Z`),
                )}
              </p>
              <footer>
                <Button variant="outline" onClick={() => edit(goal)}>
                  <Pencil />
                  Editar
                </Button>
                <button
                  className="goal-delete"
                  onClick={() => remove(goal)}
                  aria-label={`Excluir ${goal.name}`}
                >
                  <Trash2 />
                </button>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
function SettingsPage({
  settings,
  saving,
  save,
}: {
  settings: SystemSettings;
  saving: boolean;
  save: (settings: SystemSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(settings), [settings]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    try {
      await save(draft);
      setSaved(true);
    } catch {}
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  return (
    <form id="settings-form" className="settings-page" onSubmit={submit}>
      <section className="settings-card">
        <header>
          <span>
            <Building2 />
          </span>
          <div>
            <h2>Dados da empresa</h2>
            <p>
              Informações institucionais utilizadas nos documentos do sistema.
            </p>
          </div>
        </header>
        <div className="settings-fields">
          <Field label="Nome da empresa">
            <Input
              value={draft.companyName}
              onChange={(event) =>
                setDraft({ ...draft, companyName: event.target.value })
              }
              required
            />
          </Field>
          <Field label="CNPJ">
            <Input
              value={draft.document ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, document: event.target.value })
              }
              placeholder="00.000.000/0000-00"
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              value={draft.email ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, email: event.target.value })
              }
            />
          </Field>
          <Field label="Telefone">
            <Input
              value={draft.phone ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, phone: event.target.value })
              }
            />
          </Field>
          <Field label="Endereço">
            <Input
              value={draft.address ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, address: event.target.value })
              }
            />
          </Field>
          <Field label="Cidade">
            <Input
              value={draft.city ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, city: event.target.value })
              }
            />
          </Field>
          <Field label="Estado">
            <Input
              maxLength={2}
              value={draft.state ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, state: event.target.value.toUpperCase() })
              }
            />
          </Field>
          <Field label="CEP">
            <Input
              value={draft.postalCode ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, postalCode: event.target.value })
              }
            />
          </Field>
        </div>
      </section>
      <section className="settings-card">
        <header>
          <span>
            <CircleDollarSign />
          </span>
          <div>
            <h2>Padrões comerciais</h2>
            <p>
              Valores sugeridos automaticamente ao iniciar uma nova proposta.
            </p>
          </div>
        </header>
        <div className="settings-fields commercial">
          <Field label="Tabela de preços padrão">
            <select
              value={draft.defaultPriceTable}
              onChange={(event) =>
                setDraft({ ...draft, defaultPriceTable: event.target.value })
              }
            >
              <option value="competitiva">Competitiva</option>
              <option value="padrao">Padrão</option>
              <option value="valor">Valor agregado</option>
            </select>
          </Field>
          <Field label="Validade da proposta (dias)">
            <Input
              type="number"
              min="1"
              max="365"
              value={draft.proposalValidityDays}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  proposalValidityDays: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Observação padrão">
            <Textarea
              value={draft.proposalNotes ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, proposalNotes: event.target.value })
              }
              placeholder="Condições ou informações que devem aparecer nas novas propostas."
            />
          </Field>
        </div>
      </section>
      <section className="settings-card">
        <header>
          <span>
            <ReceiptText />
          </span>
          <div>
            <h2>Padrões financeiros</h2>
            <p>
              Condição inicial sugerida na preparação de novos faturamentos.
            </p>
          </div>
        </header>
        <div className="settings-fields financial">
          <Field label="Condição de pagamento">
            <select
              value={draft.defaultPaymentTerms}
              onChange={(event) =>
                setDraft({ ...draft, defaultPaymentTerms: event.target.value })
              }
            >
              <option value="À vista">À vista</option>
              <option value="A prazo">A prazo</option>
              <option value="Parcelado">Parcelado</option>
            </select>
          </Field>
          <Field label="Parcelas padrão">
            <Input
              type="number"
              min="1"
              max="120"
              value={draft.defaultInstallments}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  defaultInstallments: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Prazo para vencimento (dias)">
            <Input
              type="number"
              min="0"
              max="365"
              value={draft.defaultDueDays}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  defaultDueDays: Number(event.target.value),
                })
              }
            />
          </Field>
        </div>
      </section>
      <footer className="settings-actions">
        {saved && !dirty && (
          <span>
            <CheckCircle2 />
            Configurações salvas.
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || saving}
          onClick={() => {
            setDraft(settings);
            setSaved(false);
          }}
        >
          Cancelar alterações
        </Button>
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? (
            <>
              <Loader2 className="spin" />
              Salvando...
            </>
          ) : (
            "Salvar configurações"
          )}
        </Button>
      </footer>
    </form>
  );
}
function Reports({
  opportunities,
  proposals,
  sales,
  billings,
  receivables,
  payables,
}: {
  opportunities: Opportunity[];
  proposals: ProposalRecord[];
  sales: SaleRecord[];
  billings: BillingRecord[];
  receivables: ReceivableRecord[];
  payables: PayableRecord[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState({
    from: `${today.slice(0, 4)}-01-01`,
    to: today,
  });
  const inside = (value: string | null | undefined) =>
    Boolean(
      value &&
      value.slice(0, 10) >= period.from &&
      value.slice(0, 10) <= period.to,
    );
  const periodProposals = proposals.filter((item) => inside(item.createdAt)),
    periodSales = sales.filter((item) => inside(item.createdAt)),
    periodReceivables = receivables.filter((item) => inside(item.dueDate)),
    periodPayables = payables.filter(
      (item) => inside(item.dueDate) && item.status !== "cancelado",
    );
  const proposed = periodProposals.reduce((sum, item) => sum + item.total, 0),
    approved = periodProposals
      .filter((item) => item.status === "aprovada")
      .reduce((sum, item) => sum + item.total, 0),
    sold = periodSales.reduce((sum, item) => sum + item.total, 0),
    cost = periodSales.reduce((sum, item) => sum + item.cost, 0),
    received = periodReceivables.reduce(
      (sum, item) => sum + item.receivedAmount,
      0,
    ),
    toReceive = periodReceivables.reduce(
      (sum, item) =>
        sum +
        Math.max(
          0,
          item.amount +
            item.interest +
            item.penalty -
            item.discount -
            item.receivedAmount,
        ),
      0,
    ),
    paid = periodPayables.reduce((sum, item) => sum + item.paidAmount, 0),
    toPay = periodPayables.reduce(
      (sum, item) => sum + Math.max(0, item.amount - item.paidAmount),
      0,
    ),
    conversion = periodProposals.length
      ? (periodProposals.filter((item) => item.status === "aprovada").length /
          periodProposals.length) *
        100
      : 0,
    margin = sold ? ((sold - cost) / sold) * 100 : 0;
  const months: string[] = [];
  let cursor = new Date(`${period.from}T12:00:00Z`),
    end = new Date(`${period.to}T12:00:00Z`);
  while (cursor <= end && months.length < 24) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1, 12),
    );
  }
  const visibleMonths = months.slice(-12);
  const monthly = visibleMonths.map((month) => ({
    month,
    label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
      .format(new Date(`${month}-01T12:00:00Z`))
      .replace(".", ""),
    sales: periodSales
      .filter((item) => item.createdAt.startsWith(month))
      .reduce((sum, item) => sum + item.total, 0),
    received: receivables
      .filter((item) => item.paymentDate?.startsWith(month))
      .reduce((sum, item) => sum + item.receivedAmount, 0),
  }));
  const chartMax = Math.max(
    1,
    ...monthly.flatMap((item) => [item.sales, item.received]),
  );
  const proposalStatuses = [
    ["rascunho", "Rascunho"],
    ["enviada", "Enviada"],
    ["aprovada", "Aprovada"],
    ["recusada", "Recusada"],
    ["expirada", "Expirada"],
  ].map(([status, label]) => ({
    status,
    label,
    count: periodProposals.filter((item) => item.status === status).length,
  }));
  const statusMax = Math.max(1, ...proposalStatuses.map((item) => item.count));
  const clientMap = new Map<string, number>();
  periodSales.forEach((item) =>
    clientMap.set(
      item.companyName,
      (clientMap.get(item.companyName) || 0) + item.total,
    ),
  );
  const topClients = [...clientMap].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const clientMax = Math.max(1, ...topClients.map((item) => item[1]));
  const stageLabels: Record<string, string> = {
    novo: "Novos",
    qualificacao: "Qualificação",
    proposta: "Proposta",
    negociacao: "Negociação",
    ganho: "Ganhos",
  };
  return (
    <div className="reports-page">
      <div className="report-filter">
        <Field label="Período de">
          <Input
            type="date"
            value={period.from}
            onChange={(event) =>
              setPeriod({ ...period, from: event.target.value })
            }
          />
        </Field>
        <Field label="Até">
          <Input
            type="date"
            value={period.to}
            onChange={(event) =>
              setPeriod({ ...period, to: event.target.value })
            }
          />
        </Field>
        <span>
          Indicadores calculados com os registros do período selecionado.
        </span>
      </div>
      <div className="report-kpis">
        <article>
          <small>Propostas emitidas</small>
          <strong>{money(proposed)}</strong>
          <span>
            {periodProposals.length} propostas · {conversion.toFixed(1)}%
            aprovadas
          </span>
        </article>
        <article>
          <small>Vendas</small>
          <strong>{money(sold)}</strong>
          <span>{periodSales.length} pedidos gerados</span>
        </article>
        <article>
          <small>Resultado estimado</small>
          <strong>{money(sold - cost)}</strong>
          <span>Margem de {margin.toFixed(1)}%</span>
        </article>
        <article>
          <small>Recebido</small>
          <strong>{money(received)}</strong>
          <span>{money(toReceive)} a receber</span>
        </article>
        <article>
          <small>Pago</small>
          <strong>{money(paid)}</strong>
          <span>{money(toPay)} a pagar</span>
        </article>
      </div>
      <div className="report-grid">
        <article className="report-panel report-cash">
          <header>
            <div>
              <small>FLUXO FINANCEIRO</small>
              <h2>Vendas e recebimentos</h2>
            </div>
            <div className="report-legend">
              <span className="sales">Vendas</span>
              <span className="received">Recebido</span>
            </div>
          </header>
          {monthly.some((item) => item.sales || item.received) ? (
            <div className="monthly-chart">
              {monthly.map((item) => (
                <div key={item.month}>
                  <div className="chart-columns">
                    <i
                      className="sales"
                      style={{
                        height: `${Math.max(item.sales ? 5 : 0, (item.sales / chartMax) * 100)}%`,
                      }}
                      title={`Vendas: ${money(item.sales)}`}
                    />
                    <i
                      className="received"
                      style={{
                        height: `${Math.max(item.received ? 5 : 0, (item.received / chartMax) * 100)}%`,
                      }}
                      title={`Recebido: ${money(item.received)}`}
                    />
                  </div>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="report-empty">
              Sem movimentações financeiras neste período.
            </p>
          )}
        </article>
        <article className="report-panel">
          <header>
            <div>
              <small>PROPOSTAS</small>
              <h2>Distribuição por status</h2>
            </div>
            <strong>{money(approved)} aprovados</strong>
          </header>
          <div className="horizontal-bars">
            {proposalStatuses.map((item) => (
              <div key={item.status}>
                <span>{item.label}</span>
                <i>
                  <b
                    className={item.status}
                    style={{ width: `${(item.count / statusMax) * 100}%` }}
                  />
                </i>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="report-panel">
          <header>
            <div>
              <small>CARTEIRA</small>
              <h2>Maiores clientes em vendas</h2>
            </div>
          </header>
          {topClients.length ? (
            <div className="client-ranking">
              {topClients.map(([name, value], index) => (
                <div key={name}>
                  <b>{index + 1}</b>
                  <span>
                    <strong>{name}</strong>
                    <i>
                      <em style={{ width: `${(value / clientMax) * 100}%` }} />
                    </i>
                  </span>
                  <small>{money(value)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="report-empty">Nenhuma venda no período.</p>
          )}
        </article>
        <article className="report-panel">
          <header>
            <div>
              <small>PIPELINE ATUAL</small>
              <h2>Oportunidades por etapa</h2>
            </div>
          </header>
          <div className="funnel-report">
            {stages.map((stage) => {
              const count = opportunities.filter(
                  (item) => item.stage === stage.id,
                ).length,
                value = opportunities
                  .filter((item) => item.stage === stage.id)
                  .reduce((sum, item) => sum + item.value, 0);
              return (
                <div key={stage.id}>
                  <i style={{ background: stage.color }} />
                  <span>{stageLabels[stage.id]}</span>
                  <strong>{count}</strong>
                  <small>{money(value)}</small>
                </div>
              );
            })}
          </div>
        </article>
      </div>
    </div>
  );
}
function Team({
  team,
  currentUserId,
  add,
  edit,
  toggle,
}: {
  team: TeamMember[];
  currentUserId: number | null;
  add: () => void;
  edit: (member: TeamMember) => void;
  toggle: (member: TeamMember) => void;
}) {
  const [search, setSearch] = useState("");
  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    manager: "Gestor",
    seller: "Comercial",
    finance: "Financeiro",
    viewer: "Somente consulta",
  };
  const permissionLabels: Record<string, string> = {
    crm: "CRM",
    proposals: "Propostas",
    sales: "Pedidos",
    billing: "Faturamento",
    receivables: "Recebimentos",
    payables: "Pagamentos",
    reports: "Relatórios",
    settings: "Configurações",
  };
  const filtered = team.filter((member) =>
    `${member.name} ${member.email} ${member.jobTitle ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  if (!team.length)
    return (
      <Empty
        icon={<Users />}
        title="Nenhum usuário cadastrado"
        text="Cadastre sua equipe e determine os acessos de cada pessoa."
        action="Cadastrar primeiro usuário"
        onClick={add}
      />
    );
  return (
    <div className="team-page">
      <div className="team-summary">
        <span>
          <strong>{team.filter((member) => member.active).length}</strong>{" "}
          usuários ativos
        </span>
        <span>
          <strong>
            {team.filter((member) => member.role === "admin").length}
          </strong>{" "}
          administradores
        </span>
        <div>
          <Search />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar na equipe"
          />
        </div>
      </div>
      <div className="team-grid">
        {filtered.map((member) => (
          <article
            className={`member-card ${member.active ? "" : "inactive"}`}
            key={member.id}
          >
            <header>
              <span className="member-avatar">{initials(member.name)}</span>
              <div>
                <small>
                  {member.id === currentUserId
                    ? "SEU ACESSO"
                    : (roleLabels[member.role] ?? member.role)}
                </small>
                <h2>{member.name}</h2>
                <p>{member.jobTitle || "Função não informada"}</p>
              </div>
              <b className={member.active ? "active" : ""}>
                {member.active ? "Ativo" : "Inativo"}
              </b>
            </header>
            <a href={`mailto:${member.email}`}>
              <Mail />
              {member.email}
            </a>
            <div className="member-permissions">
              {member.permissions.map((permission) => (
                <span key={permission}>
                  {permissionLabels[permission] ?? permission}
                </span>
              ))}
            </div>
            <footer>
              <Button variant="outline" onClick={() => edit(member)}>
                <Pencil />
                Editar permissões
              </Button>
              <Button
                variant="outline"
                disabled={member.id === currentUserId}
                className={member.active ? "member-disable" : "member-enable"}
                onClick={() => toggle(member)}
              >
                {member.active ? "Desativar" : "Reativar"}
              </Button>
            </footer>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="filter-empty">Nenhum usuário encontrado.</div>
      )}
      <p className="team-access-note">
        O cadastro prepara as permissões internas. Para o primeiro acesso, o
        usuário também precisa ser incluído no compartilhamento do TDK Manager.
      </p>
    </div>
  );
}
function Payables({
  payables,
  update,
  add,
}: {
  payables: PayableRecord[];
  update: (
    item: PayableRecord,
    changes: Partial<PayableRecord> & { action?: string },
  ) => void;
  add: () => void;
}) {
  const [filters, setFilters] = useState({
    supplier: "",
    client: "",
    project: "",
    description: "",
    status: "",
    from: "",
    to: "",
  });
  const today = new Date().toISOString().slice(0, 10);
  const active = payables.filter((item) => item.status !== "cancelado"),
    open = active.reduce(
      (sum, item) => sum + Math.max(0, item.amount - item.paidAmount),
      0,
    ),
    overdue = active
      .filter((item) => item.status !== "pago" && item.dueDate < today)
      .reduce(
        (sum, item) => sum + Math.max(0, item.amount - item.paidAmount),
        0,
      ),
    paid = active.reduce((sum, item) => sum + item.paidAmount, 0);
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtered = payables.filter((item) => {
    const isOverdue =
      !["pago", "cancelado"].includes(item.status) && item.dueDate < today;
    return (
      (!filters.supplier ||
        normalized(item.supplierName).includes(normalized(filters.supplier))) &&
      (!filters.client ||
        normalized(item.companyName ?? "").includes(
          normalized(filters.client),
        )) &&
      (!filters.project ||
        normalized(item.project ?? "").includes(normalized(filters.project))) &&
      (!filters.description ||
        normalized(
          `${item.description} ${item.reference ?? ""} ${item.groupNumber}`,
        ).includes(normalized(filters.description))) &&
      (!filters.status ||
        (filters.status === "vencido"
          ? isOverdue
          : item.status === filters.status)) &&
      (!filters.from || item.dueDate >= filters.from) &&
      (!filters.to || item.dueDate <= filters.to)
    );
  });
  if (!payables.length)
    return (
      <Empty
        icon={<WalletCards />}
        title="Nenhuma conta a pagar"
        text="Cadastre fornecedores, despesas e vencimentos para organizar os pagamentos."
        action="Cadastrar primeira conta"
        onClick={add}
      />
    );
  return (
    <div className="payables-page">
      <div className="payable-metrics">
        <span>
          A pagar<strong>{money(open)}</strong>
        </span>
        <span>
          Vencido<strong>{money(overdue)}</strong>
        </span>
        <span>
          Pago<strong>{money(paid)}</strong>
        </span>
      </div>
      <div className="filter-bar payable-filters">
        <Field label="Fornecedor">
          <Input
            placeholder="Buscar fornecedor"
            value={filters.supplier}
            onChange={(event) =>
              setFilters({ ...filters, supplier: event.target.value })
            }
          />
        </Field>
        <Field label="Cliente">
          <Input
            placeholder="Buscar cliente"
            value={filters.client}
            onChange={(event) =>
              setFilters({ ...filters, client: event.target.value })
            }
          />
        </Field>
        <Field label="Projeto">
          <Input
            placeholder="Buscar projeto"
            value={filters.project}
            onChange={(event) =>
              setFilters({ ...filters, project: event.target.value })
            }
          />
        </Field>
        <Field label="Descrição / documento">
          <Input
            placeholder="Descrição, NF ou referência"
            value={filters.description}
            onChange={(event) =>
              setFilters({ ...filters, description: event.target.value })
            }
          />
        </Field>
        <Field label="Status">
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters({ ...filters, status: event.target.value })
            }
          >
            <option value="">Todos</option>
            <option value="aberto">Em aberto</option>
            <option value="vencido">Vencido</option>
            <option value="parcial">Parcial</option>
            <option value="pago">Pago</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </Field>
        <Field label="Vencimento de">
          <Input
            type="date"
            value={filters.from}
            onChange={(event) =>
              setFilters({ ...filters, from: event.target.value })
            }
          />
        </Field>
        <Field label="Até">
          <Input
            type="date"
            value={filters.to}
            onChange={(event) =>
              setFilters({ ...filters, to: event.target.value })
            }
          />
        </Field>
      </div>
      {filtered.length ? (
        <div className="payable-list">
          {filtered.map((item) => (
            <PayableRow
              key={`${item.id}-${item.updatedAt}`}
              item={item}
              today={today}
              update={update}
            />
          ))}
        </div>
      ) : (
        <div className="filter-empty">
          Nenhuma conta encontrada com esses filtros.
        </div>
      )}
    </div>
  );
}
function PayableRow({
  item,
  today,
  update,
}: {
  item: PayableRecord;
  today: string;
  update: (
    item: PayableRecord,
    changes: Partial<PayableRecord> & { action?: string },
  ) => void;
}) {
  const [draft, setDraft] = useState(item);
  const dirty = [
    "reference",
    "description",
    "category",
    "amount",
    "dueDate",
    "paidAmount",
    "paymentDate",
  ].some(
    (key) =>
      draft[key as keyof PayableRecord] !== item[key as keyof PayableRecord],
  );
  const overdue =
    !["pago", "cancelado"].includes(item.status) && item.dueDate < today;
  const save = () =>
    update(item, {
      reference: draft.reference,
      description: draft.description,
      category: draft.category,
      amount: Number(draft.amount),
      dueDate: draft.dueDate,
      paidAmount: Number(draft.paidAmount),
      paymentDate: draft.paymentDate,
    });
  const reverse = () => {
    if (window.confirm("Estornar este pagamento e reabrir a conta?"))
      update(item, { paidAmount: 0, paymentDate: null });
  };
  const cancel = () => {
    if (window.confirm("Cancelar esta conta a pagar?"))
      update(item, { action: "cancel" });
  };
  const reopen = () => update(item, { action: "reopen" });
  return (
    <article
      className={`payable-card ${overdue ? "overdue" : ""} ${item.status}`}
    >
      <header>
        <div>
          <small>
            {item.groupNumber} · Parcela {item.installmentNumber}/
            {item.installmentCount}
          </small>
          <h2>{item.supplierName}</h2>
          <p>
            {item.description}
            {item.reference ? ` · ${item.reference}` : ""}
          </p>
        </div>
        <b className={`payable-status ${item.status}`}>
          {item.status === "pago"
            ? "Pago"
            : item.status === "parcial"
              ? "Parcial"
              : item.status === "cancelado"
                ? "Cancelado"
                : overdue
                  ? "Vencido"
                  : "Em aberto"}
        </b>
      </header>
      <div className="payable-fields">
        <Field label="Descrição">
          <Input
            value={draft.description}
            disabled={item.status === "cancelado"}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </Field>
        <Field label="Referência">
          <Input
            value={draft.reference ?? ""}
            disabled={item.status === "cancelado"}
            onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
          />
        </Field>
        <Field label="Categoria">
          <select
            value={draft.category}
            disabled={item.status === "cancelado"}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          >
            <option value="fornecedor">Fornecedor / materiais</option>
            <option value="servicos">Serviços</option>
            <option value="impostos">Impostos e taxas</option>
            <option value="pessoal">Pessoal</option>
            <option value="estrutura">Estrutura</option>
            <option value="outros">Outros</option>
          </select>
        </Field>
        <Field label="Valor da parcela">
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={draft.amount}
            disabled={item.status === "cancelado"}
            onChange={(e) =>
              setDraft({ ...draft, amount: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Vencimento">
          <Input
            type="date"
            value={draft.dueDate}
            disabled={item.status === "cancelado"}
            onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
          />
        </Field>
        <Field label="Valor pago">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={draft.paidAmount}
            disabled={item.status === "cancelado"}
            onChange={(e) =>
              setDraft({ ...draft, paidAmount: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Data do pagamento">
          <Input
            type="date"
            value={draft.paymentDate ?? ""}
            disabled={item.status === "cancelado"}
            onChange={(e) =>
              setDraft({ ...draft, paymentDate: e.target.value || null })
            }
          />
        </Field>
      </div>
      <div className="payable-actions">
        {item.status === "cancelado" ? (
          <Button variant="outline" onClick={reopen}>
            Reabrir conta
          </Button>
        ) : (
          <>
            {item.paidAmount > 0 && (
              <Button
                variant="outline"
                className="reverse-payable"
                disabled={dirty}
                onClick={reverse}
              >
                Estornar pagamento
              </Button>
            )}
            <Button
              variant="outline"
              className="cancel-payable"
              disabled={dirty}
              onClick={cancel}
            >
              Cancelar conta
            </Button>
            {item.status !== "pago" && (
              <Button
                variant="outline"
                onClick={() =>
                  setDraft({
                    ...draft,
                    paidAmount: Number(draft.amount),
                    paymentDate: today,
                  })
                }
              >
                Quitar parcela
              </Button>
            )}
            <Button
              variant="outline"
              disabled={!dirty}
              onClick={() => setDraft(item)}
            >
              Cancelar edição
            </Button>
            <Button disabled={!dirty} onClick={save}>
              Salvar alterações
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
function Receivables({
  receivables,
  update,
}: {
  receivables: ReceivableRecord[];
  update: (item: ReceivableRecord, changes: Partial<ReceivableRecord>) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const pending = receivables.filter((item) => item.status !== "recebido");
  const due = pending
    .filter((item) => item.dueDate < today)
    .reduce((sum, item) => sum + item.amount - item.receivedAmount, 0);
  const open = pending.reduce(
    (sum, item) => sum + item.amount - item.receivedAmount,
    0,
  );
  const received = receivables.reduce(
    (sum, item) => sum + item.receivedAmount,
    0,
  );
  if (!receivables.length)
    return (
      <Empty
        icon={<CircleDollarSign />}
        title="Nenhuma parcela gerada"
        text="Prepare um faturamento, informe o vencimento e gere suas parcelas."
        action="Aguardando faturamento"
        onClick={() => {}}
      />
    );
  return (
    <div className="receivable-page">
      <div className="receivable-metrics">
        <span>
          A receber<strong>{money(open)}</strong>
        </span>
        <span>
          Vencido<strong>{money(due)}</strong>
        </span>
        <span>
          Recebido<strong>{money(received)}</strong>
        </span>
      </div>
      <div className="receivable-list">
        {receivables.map((item) => (
          <ReceivableRow
            key={`${item.id}-${item.updatedAt}`}
            item={item}
            today={today}
            update={update}
          />
        ))}
      </div>
    </div>
  );
}
function ReceivableRow({
  item,
  today,
  update,
}: {
  item: ReceivableRecord;
  today: string;
  update: (item: ReceivableRecord, changes: Partial<ReceivableRecord>) => void;
}) {
  const [draft, setDraft] = useState(item);
  const overdue = item.status !== "recebido" && item.dueDate < today;
  const dirty = [
    "interest",
    "penalty",
    "discount",
    "receivedAmount",
    "paymentDate",
  ].some(
    (key) =>
      draft[key as keyof ReceivableRecord] !==
      item[key as keyof ReceivableRecord],
  );
  const reverse = () => {
    if (window.confirm("Estornar este recebimento e reabrir a parcela?"))
      update(item, { receivedAmount: 0, paymentDate: null });
  };
  return (
    <article className={`receivable-row ${overdue ? "overdue" : ""}`}>
      <div className="receivable-title">
        <small>
          {item.billingNumber} · Parcela {item.installmentNumber}
        </small>
        <strong>{item.companyName}</strong>
        <span>
          Vence em{" "}
          {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
            new Date(`${item.dueDate}T12:00:00Z`),
          )}
        </span>
      </div>
      <span className="receivable-amount">{money(item.amount)}</span>
      <div className="receivable-inputs">
        <Field label="Juros">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={draft.interest}
            onChange={(e) =>
              setDraft({ ...draft, interest: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Multa">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={draft.penalty}
            onChange={(e) =>
              setDraft({ ...draft, penalty: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Desconto">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={draft.discount}
            onChange={(e) =>
              setDraft({ ...draft, discount: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Recebido">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={draft.receivedAmount}
            onChange={(e) =>
              setDraft({ ...draft, receivedAmount: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Pagamento">
          <Input
            type="date"
            value={draft.paymentDate ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, paymentDate: e.target.value || null })
            }
          />
        </Field>
      </div>
      <b className={`receivable-badge ${item.status}`}>
        {item.status === "recebido"
          ? "Recebida"
          : item.status === "parcial"
            ? "Parcial"
            : overdue
              ? "Vencida"
              : "Em aberto"}
      </b>
      <div className="receivable-actions">
        {(item.receivedAmount > 0 || item.paymentDate) && (
          <Button
            variant="outline"
            className="reverse-receivable"
            disabled={dirty}
            onClick={reverse}
          >
            Estornar recebimento
          </Button>
        )}
        <Button disabled={!dirty} onClick={() => update(item, draft)}>
          Salvar alterações
        </Button>
        <Button
          variant="outline"
          disabled={!dirty}
          onClick={() => setDraft(item)}
        >
          Cancelar edição
        </Button>
      </div>
    </article>
  );
}
function Billings({
  billings,
  update,
  generate,
}: {
  billings: BillingRecord[];
  update: (billing: BillingRecord, changes: Partial<BillingRecord>) => void;
  generate: (billing: BillingRecord) => void;
}) {
  const [client, setClient] = useState("");
  const [order, setOrder] = useState("");
  const [status, setStatus] = useState("todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  if (!billings.length)
    return (
      <Empty
        icon={<ReceiptText />}
        title="Nenhum faturamento preparado"
        text="Conclua um pedido para liberar sua preparação financeira."
        action="Aguardando pedidos concluídos"
        onClick={() => {}}
      />
    );
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtered = billings.filter((item) => {
    const date = item.createdAt.slice(0, 10);
    return (
      (!client || normalized(item.companyName).includes(normalized(client))) &&
      (!order ||
        normalized(`${item.number} ${item.saleNumber}`).includes(
          normalized(order),
        )) &&
      (status === "todos" || item.status === status) &&
      (!from || date >= from) &&
      (!to || date <= to)
    );
  });
  return (
    <>
      <div className="filter-bar billing-filters">
        <Field label="Cliente">
          <Input
            placeholder="Buscar cliente"
            value={client}
            onChange={(event) => setClient(event.target.value)}
          />
        </Field>
        <Field label="Pedido / faturamento">
          <Input
            placeholder="Ex.: PED-2026"
            value={order}
            onChange={(event) => setOrder(event.target.value)}
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="parcial">Parcial</option>
            <option value="recebido">Recebido</option>
          </select>
        </Field>
        <Field label="De">
          <Input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </Field>
        <Field label="Até">
          <Input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </Field>
      </div>
      {filtered.length ? (
        <div className="billing-list">
          {filtered.map((item) => (
            <BillingCard
              key={`${item.id}-${item.updatedAt}`}
              item={item}
              update={update}
              generate={generate}
            />
          ))}
        </div>
      ) : (
        <div className="filter-empty">
          Nenhum faturamento encontrado com esses filtros.
        </div>
      )}
    </>
  );
}
function BillingCard({
  item,
  update,
  generate,
}: {
  item: BillingRecord;
  update: (billing: BillingRecord, changes: Partial<BillingRecord>) => void;
  generate: (billing: BillingRecord) => void;
}) {
  const [draft, setDraft] = useState(item);
  const fields: (keyof BillingRecord)[] = [
    "paymentTerms",
    "installments",
    "dueDate",
    "materialInvoice",
    "serviceInvoice",
  ];
  const dirty = fields.some((key) => draft[key] !== item[key]);
  const open = Math.max(0, item.total - item.receivedAmount);
  const save = () =>
    update(item, {
      paymentTerms: draft.paymentTerms,
      installments: Math.max(1, Number(draft.installments) || 1),
      dueDate: draft.dueDate,
      materialInvoice: draft.materialInvoice,
      serviceInvoice: draft.serviceInvoice,
    });
  return (
    <article className="billing-card">
      <header>
        <div>
          <small>
            {item.number} · {item.saleNumber}
          </small>
          <h2>{item.companyName}</h2>
        </div>
        <span className={`billing-status ${item.status}`}>
          {item.status === "recebido"
            ? "Recebido"
            : item.status === "parcial"
              ? "Parcial"
              : "Pendente"}
        </span>
      </header>
      <div className="billing-values">
        <span>
          Materiais<strong>{money(item.materialAmount)}</strong>
        </span>
        <span>
          Serviços<strong>{money(item.serviceAmount)}</strong>
        </span>
        <span>
          Total<strong>{money(item.total)}</strong>
        </span>
        <span>
          Em aberto<strong>{money(open)}</strong>
        </span>
      </div>
      <div className="billing-fields">
        <Field label="Condição de pagamento">
          <select
            value={draft.paymentTerms}
            onChange={(event) =>
              setDraft({ ...draft, paymentTerms: event.target.value })
            }
          >
            <option value="À vista">À vista</option>
            <option value="A prazo">A prazo</option>
            <option value="Parcelado">Parcelado</option>
          </select>
        </Field>
        <Field label="Parcelas">
          <Input
            type="number"
            min="1"
            value={draft.installments}
            onChange={(event) =>
              setDraft({ ...draft, installments: Number(event.target.value) })
            }
          />
        </Field>
        <Field label="1º vencimento">
          <Input
            type="date"
            value={draft.dueDate ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, dueDate: event.target.value || null })
            }
          />
        </Field>
        <Field label="NF materiais">
          <Input
            value={draft.materialInvoice ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, materialInvoice: event.target.value })
            }
          />
        </Field>
        <Field label="NF serviços">
          <Input
            value={draft.serviceInvoice ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, serviceInvoice: event.target.value })
            }
          />
        </Field>
        <Field label="Valor recebido">
          <Input value={money(item.receivedAmount)} disabled />
        </Field>
      </div>
      <div className="billing-actions">
        <Button disabled={!dirty} onClick={save}>
          Salvar alterações
        </Button>
        <Button
          variant="outline"
          disabled={!dirty}
          onClick={() => setDraft(item)}
        >
          Cancelar
        </Button>
        <Button
          className="receivable-button"
          disabled={dirty}
          onClick={() => generate(item)}
        >
          Gerar / atualizar parcelas
        </Button>
      </div>
      {dirty && (
        <small className="billing-warning">
          Salve ou cancele as alterações antes de atualizar as parcelas.
        </small>
      )}
    </article>
  );
}
const serviceCallStatuses = [
  { id: "aberto", label: "Aberto" },
  { id: "acionado", label: "Acionado" },
  { id: "confirmado", label: "Confirmado" },
  { id: "deslocamento", label: "Deslocamento" },
  { id: "atendimento", label: "Em atendimento" },
  { id: "pendente", label: "Pendente" },
  { id: "concluido", label: "Concluído" },
  { id: "cancelado", label: "Cancelado" },
];
const executionServiceCallStatuses = new Set([
  "confirmado",
  "deslocamento",
  "atendimento",
  "pendente",
  "concluido",
]);
const reportServiceCallStatuses = new Set([
  "atendimento",
  "pendente",
  "concluido",
]);
const serviceCallNumber = (number: string) =>
  number.replace(/^OS-(?:\d{4}-)?/, "TDK-").replace(/^TDK-\d{4}-/, "TDK-");
function ServiceCallEntriesEditor({
  callId,
  catalog,
  equipmentCatalog,
  priceTable,
  technician,
}: {
  callId: number;
  catalog: CatalogItem[];
  equipmentCatalog: EquipmentCatalogItem[];
  priceTable: string;
  technician: string;
}) {
  const empty = {
    services: [] as ServiceEntry[],
    materials: [] as MaterialEntry[],
    equipment: [] as EquipmentEntry[],
    expenses: [] as ExpenseEntry[],
  };
  const [entries, setEntries] = useState(empty),
    [tab, setTab] = useState<"service" | "material" | "equipment" | "expense">(
      "service",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [form, setForm] = useState<Record<string, string>>({
    catalogId: "",
    equipmentItemId: "",
    description: "",
    quantity: "1",
    unit: "serviço",
    technician,
    notes: "",
    unitCost: "0",
    unitPrice: "0",
    priceTable,
    brandModel: "",
    removedSerial: "",
    installedSerial: "",
    reason: "",
    category: "deslocamento",
    amount: "0",
    expenseDate: new Date().toISOString().slice(0, 10),
  });
  const load = async () => {
    try {
      const response = await fetch(
        `/api/service-call-entries?serviceCallId=${callId}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEntries(data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os lançamentos.",
      );
    }
  };
  useEffect(() => {
    load();
  }, [callId]);
  const add = async () => {
    if (!form.description.trim())
      return setError("Informe a descrição do lançamento.");
    if (tab !== "expense" && tab !== "equipment" && !form.catalogId)
      return setError("Selecione um item disponível no cadastro.");
    if (tab === "equipment" && !form.equipmentItemId)
      return setError("Selecione um equipamento ou peça cadastrado.");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/service-call-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          type: tab,
          serviceCallId: callId,
          catalogId: tab === "expense" ? null : Number(form.catalogId),
          equipmentItemId: tab === "equipment" ? Number(form.equipmentItemId) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await load();
      setForm((current) => ({
        ...current,
        description: "",
        catalogId: "",
        equipmentItemId: "",
        quantity: "1",
        notes: "",
        brandModel: "",
        removedSerial: "",
        installedSerial: "",
        reason: "",
        amount: "0",
      }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível adicionar.",
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async (type: string, id: number) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/service-call-entries?type=${type}&id=${id}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível excluir.",
      );
    } finally {
      setBusy(false);
    }
  };
  const active =
    tab === "service"
      ? entries.services
      : tab === "material"
        ? entries.materials
        : tab === "equipment"
          ? entries.equipment
          : entries.expenses;
  const labels = {
    service: "Serviços",
    material: "Materiais",
    equipment: "Equipamentos / peças",
    expense: "Despesas",
  };
  const expectedCatalogCategory = tab === "service" ? "servico" : "material";
  const priceFor = (item: CatalogItem) => priceTable === "competitiva" ? item.competitivePrice : priceTable === "valor" ? item.valuePrice : item.standardPrice;
  const availableCatalog =
    tab === "expense"
      ? []
      : tab === "equipment" ? equipmentCatalog.filter(
          (item) => item.active && (!form.description.trim() || `${item.code ?? ""} ${item.description}`.toLowerCase().includes(form.description.trim().toLowerCase())),
        ) : catalog.filter(
          (item) =>
            item.active &&
            item.category === expectedCatalogCategory &&
            (!form.description.trim() ||
              `${item.code ?? ""} ${item.description}`
                .toLocaleLowerCase()
                .includes(form.description.trim().toLocaleLowerCase())),
        );
  return (
    <section className="service-children">
      <header>
        <Wrench />
        <div>
          <strong>Execução técnica</strong>
          <small>
            Registre quantos lançamentos forem necessários em cada categoria.
          </small>
        </div>
      </header>
      <nav>
        {(["service", "material", "equipment", "expense"] as const).map(
          (type) => (
            <button
              type="button"
              className={tab === type ? "active" : ""}
              onClick={() => {
                setTab(type);
                setError("");
                setForm((current) => ({
                  ...current,
                  catalogId: "",
                  equipmentItemId: "",
                  description: "",
                }));
              }}
              key={type}
            >
              {labels[type]}{" "}
              <span>
                {type === "service"
                  ? entries.services.length
                  : type === "material"
                    ? entries.materials.length
                    : type === "equipment"
                      ? entries.equipment.length
                      : entries.expenses.length}
              </span>
            </button>
          ),
        )}
      </nav>
      <div className="service-child-form">
        <Field
          label={
            tab === "service"
              ? "Serviço executado"
              : tab === "material"
                ? "Material utilizado"
                : tab === "equipment"
                  ? "Equipamento, parte ou peça"
                  : "Descrição da despesa"
          }
        >
          <Input
            list={
              tab !== "expense" ? `service-catalog-${tab}-${callId}` : undefined
            }
            value={form.description}
            onChange={(event) => {
              const description = event.target.value;
              const equipment = tab === "equipment" ? equipmentCatalog.find((entry) => entry.description === description) : undefined;
              const item = tab !== "equipment" ? catalog.find((entry) => entry.description === description && entry.category === (tab === "service" ? "servico" : "material")) : undefined;
              setForm({
                ...form,
                description,
                catalogId: item ? String(item.id) : "",
                equipmentItemId: equipment ? String(equipment.id) : "",
                ...(item
                  ? { unit: item.unit, unitCost: String(item.cost), unitPrice: String(priceFor(item)), priceTable }
                  : equipment
                    ? { unit: equipment.unit, unitCost: String(equipment.cost), brandModel: [equipment.brand, equipment.model].filter(Boolean).join(" / ") }
                  : {}),
              });
            }}
            placeholder={
              tab === "expense"
                ? "Descreva a despesa"
                : "Digite para localizar no cadastro"
            }
          />
        </Field>
        {tab !== "expense" && (
          <datalist id={`service-catalog-${tab}-${callId}`}>
            {(tab === "equipment" ? equipmentCatalog : catalog.filter((item) => item.category === (tab === "service" ? "servico" : "material")))
              .filter((item) => item.active)
              .map((item) => (
                <option key={item.id} value={item.description}>
                  {item.code || "Sem código"}
                </option>
              ))}
          </datalist>
        )}
        {tab !== "expense" && (
          <div className="service-catalog-browser">
            <header>
              <strong>Itens cadastrados no catálogo</strong>
              <span>{availableCatalog.length} encontrado(s)</span>
            </header>
            <div>
              {availableCatalog.slice(0, 12).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={Number(tab === "equipment" ? form.equipmentItemId : form.catalogId) === item.id ? "selected" : ""}
                  onClick={() => {
                    const commercialItem = "standardPrice" in item ? item : null;
                    setForm({
                      ...form,
                      catalogId: tab === "equipment" ? "" : String(item.id),
                      equipmentItemId: tab === "equipment" ? String(item.id) : "",
                      description: item.description,
                      unit: item.unit,
                      unitCost: String(item.cost),
                      ...(commercialItem ? { unitPrice: String(priceFor(commercialItem)), priceTable } : { brandModel: [item.brand, item.model].filter(Boolean).join(" / ") }),
                    });
                  }}
                >
                  <span>{item.code || "Sem código"}</span>
                  <strong>{item.description}</strong>
                  <small>{item.unit}</small>
                </button>
              ))}
              {!availableCatalog.length && (
                <p>Nenhum item cadastrado encontrado para esta categoria.</p>
              )}
            </div>
            {availableCatalog.length > 12 && (
              <small>
                Continue digitando para refinar os {availableCatalog.length}{" "}
                resultados.
              </small>
            )}
          </div>
        )}
        {tab !== "expense" && (
          <div className="service-child-line">
            <Field label="Quantidade">
              <Input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={form.quantity}
                onChange={(event) =>
                  setForm({ ...form, quantity: event.target.value })
                }
              />
            </Field>
            {tab !== "equipment" && (
              <Field label="Unidade">
                <Input value={form.unit} disabled />
              </Field>
            )}
            {tab === "material" && (
              <Field label={`Valor unitário · tabela ${priceTable}`}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.unitPrice}
                  onChange={(event) => setForm({ ...form, unitPrice: event.target.value })}
                />
              </Field>
            )}
          </div>
        )}
        {tab === "service" && (
          <div className="service-child-line">
            <Field label="Técnico">
              <Input
                value={form.technician}
                onChange={(event) =>
                  setForm({ ...form, technician: event.target.value })
                }
              />
            </Field>
            <Field label="Observações">
              <Input
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </Field>
          </div>
        )}
        {tab === "equipment" && (
          <>
            <div className="service-child-line">
              <Field label="Marca / modelo">
                <Input
                  value={form.brandModel}
                  onChange={(event) =>
                    setForm({ ...form, brandModel: event.target.value })
                  }
                />
              </Field>
              <Field label="Serial retirado">
                <Input
                  value={form.removedSerial}
                  onChange={(event) =>
                    setForm({ ...form, removedSerial: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="service-child-line">
              <Field label="Serial instalado">
                <Input
                  value={form.installedSerial}
                  onChange={(event) =>
                    setForm({ ...form, installedSerial: event.target.value })
                  }
                />
              </Field>
              <Field label="Motivo da troca">
                <Input
                  value={form.reason}
                  onChange={(event) =>
                    setForm({ ...form, reason: event.target.value })
                  }
                />
              </Field>
            </div>
          </>
        )}
        {tab === "expense" && (
          <div className="service-child-line">
            <Field label="Categoria">
              <select
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
              >
                <option value="deslocamento">Deslocamento</option>
                <option value="pedagio">Pedágio</option>
                <option value="estacionamento">Estacionamento</option>
                <option value="alimentacao">Alimentação</option>
                <option value="hospedagem">Hospedagem</option>
                <option value="outros">Outros</option>
              </select>
            </Field>
            <Field label="Valor (R$)">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
              />
            </Field>
            <Field label="Data">
              <Input
                type="date"
                value={form.expenseDate}
                onChange={(event) =>
                  setForm({ ...form, expenseDate: event.target.value })
                }
              />
            </Field>
          </div>
        )}
        <Button type="button" onClick={add} disabled={busy}>
          <Plus />
          Adicionar {labels[tab].toLocaleLowerCase()}
        </Button>
      </div>
      {error && <p className="service-child-error">{error}</p>}
      <div className="service-child-list">
        {active.length ? (
          active.map((entry) => (
            <article key={entry.id}>
              <div>
                <strong>{entry.description}</strong>
                <small>
                  {"amount" in entry
                    ? `${entry.category} · ${money(entry.amount)}`
                    : `${entry.quantity} ${"unit" in entry ? (entry.unit ?? "un") : "un"}${"brandModel" in entry && entry.brandModel ? ` · ${entry.brandModel}` : ""}`}
                </small>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(tab, entry.id)}
                aria-label={`Excluir ${entry.description}`}
              >
                <Trash2 />
              </button>
            </article>
          ))
        ) : (
          <p>Nenhum lançamento nesta categoria.</p>
        )}
      </div>
    </section>
  );
}

function ServiceCalls({
  calls,
  history,
  companies,
  changeStatus,
  inspect,
  edit,
}: {
  calls: ServiceCall[];
  history: ServiceCallHistory[];
  companies: Company[];
  changeStatus: (call: ServiceCall, status: string) => void;
  inspect: (call: ServiceCall) => void;
  edit: (call: ServiceCall) => void;
}) {
  const [mode, setMode] = useState<"kanban" | "list">("kanban");
  const [dragged, setDragged] = useState<number | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    status: "todos",
    technician: "",
    from: "",
    to: "",
  });
  const visible = calls.filter((call) => {
    const search =
      `${serviceCallNumber(call.number)} ${call.number} ${call.companyName} ${call.subject} ${call.location ?? ""}`.toLowerCase();
    const date = (call.scheduledAt ?? call.createdAt).slice(0, 10);
    return (
      search.includes(filters.search.toLowerCase()) &&
      (filters.status === "todos" || call.status === filters.status) &&
      (!filters.technician ||
        (call.technician ?? "")
          .toLowerCase()
          .includes(filters.technician.toLowerCase())) &&
      (!filters.from || date >= filters.from) &&
      (!filters.to || date <= filters.to)
    );
  });
  const lastChange = (id: number) =>
    history.filter((item) => item.serviceCallId === id).at(-1);
  const card = (call: ServiceCall) => (
    <article
      className={`service-call-card priority-${call.priority}`}
      key={call.id}
      draggable
      onDragStart={() => setDragged(call.id)}
      onDragEnd={() => setDragged(null)}
      onClick={() => inspect(call)}
    >
      <header>
        <span>{serviceCallNumber(call.number)}</span>
        <b>
          {
            serviceCallStatuses.find((status) => status.id === call.status)
              ?.label
          }
        </b>
      </header>
      <div className="service-card-client">
        {companies.find((company) => company.id === call.companyId)
          ?.logoStorageKey ? (
          <img src={`/api/company-logos?id=${call.companyId}`} alt="" />
        ) : (
          <span>
            <Building2 />
          </span>
        )}
        <div>
          <small>Cliente</small>
          <strong>{call.companyName}</strong>
        </div>
      </div>
      <h3>{call.location || "Localidade não informada"}</h3>
      <div className="service-call-meta">
        <span>
          <b>Assunto:</b> {call.subject}
        </span>
        <span>
          <b>Tomador:</b> {call.serviceTaker || "Não informado"}
        </span>
        <span>
          <b>Chamado cliente:</b> {call.customerTicket || "Não informado"}
        </span>
        <span>
          <b>Técnico:</b> {call.technician || "Aguardando Técnico"}
        </span>
        <span>
          <b>Agendamento:</b>{" "}
          {call.scheduledAt
            ? new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(call.scheduledAt))
            : "Sem agendamento"}
        </span>
      </div>
      <footer>
        <button
          type="button"
          className="service-card-edit"
          onClick={(event) => {
            event.stopPropagation();
            edit(call);
          }}
        >
          <Pencil /> Editar
        </button>
        <small>
          {lastChange(call.id)
            ? `Alterado por ${lastChange(call.id)?.changedBy}`
            : `Aberto por ${call.createdBy}`}
        </small>
      </footer>
    </article>
  );
  return (
    <>
      <div className="service-call-summary">
        <span>
          <strong>
            {
              calls.filter(
                (call) => !["concluido", "cancelado"].includes(call.status),
              ).length
            }
          </strong>{" "}
          ativos
        </span>
        <span>
          <strong>
            {calls.filter((call) => call.status === "atendimento").length}
          </strong>{" "}
          em atendimento
        </span>
        <span>
          <strong>
            {
              calls.filter(
                (call) =>
                  call.priority === "critica" &&
                  !["concluido", "cancelado"].includes(call.status),
              ).length
            }
          </strong>{" "}
          críticos
        </span>
        <div className="view-switch">
          <button
            className={mode === "kanban" ? "active" : ""}
            onClick={() => setMode("kanban")}
          >
            <KanbanSquare /> Kanban
          </button>
          <button
            className={mode === "list" ? "active" : ""}
            onClick={() => setMode("list")}
          >
            <ClipboardList /> Lista
          </button>
        </div>
      </div>
      <div className="filter-bar service-call-filters">
        <Field label="Número, cliente, assunto ou local">
          <Input
            value={filters.search}
            onChange={(event) =>
              setFilters({ ...filters, search: event.target.value })
            }
            placeholder="Buscar chamado..."
          />
        </Field>
        <Field label="Status">
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters({ ...filters, status: event.target.value })
            }
          >
            <option value="todos">Todos</option>
            {serviceCallStatuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Técnico">
          <Input
            value={filters.technician}
            onChange={(event) =>
              setFilters({ ...filters, technician: event.target.value })
            }
            placeholder="Responsável"
          />
        </Field>
        <Field label="De">
          <Input
            type="date"
            value={filters.from}
            onChange={(event) =>
              setFilters({ ...filters, from: event.target.value })
            }
          />
        </Field>
        <Field label="Até">
          <Input
            type="date"
            value={filters.to}
            onChange={(event) =>
              setFilters({ ...filters, to: event.target.value })
            }
          />
        </Field>
      </div>
      {mode === "kanban" ? (
        <div className="service-kanban">
          {serviceCallStatuses.map((status) => (
            <section
              key={status.id}
              className={`service-column status-${status.id}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                const call = calls.find((item) => item.id === dragged);
                if (call) changeStatus(call, status.id);
                setDragged(null);
              }}
            >
              <header>
                <strong>{status.label}</strong>
                <span>
                  {visible.filter((call) => call.status === status.id).length}
                </span>
              </header>
              <div>
                {visible.filter((call) => call.status === status.id).map(card)}
              </div>
            </section>
          ))}
        </div>
      ) : visible.length ? (
        <div className="service-call-list">{visible.map(card)}</div>
      ) : (
        <div className="filter-empty">
          Nenhum chamado encontrado com esses filtros.
        </div>
      )}
    </>
  );
}

function Projects({
  sales,
  tasks,
  files,
  team,
  update,
  addTask,
  toggleTask,
  deleteTask,
  uploadFile,
  deleteFile,
  saving,
}: {
  sales: SaleRecord[];
  tasks: ProjectTask[];
  files: ProjectFile[];
  team: TeamMember[];
  update: (sale: SaleRecord, changes: Partial<SaleRecord>) => void;
  addTask: (
    saleId: number,
    task: { title: string; responsible: string; dueDate: string },
  ) => void;
  toggleTask: (task: ProjectTask) => void;
  deleteTask: (task: ProjectTask) => void;
  uploadFile: (saleId: number, file: File) => void;
  deleteFile: (file: ProjectFile) => void;
  saving: boolean;
}) {
  const [filters, setFilters] = useState({
    search: "",
    status: "ativos",
    manager: "",
  });
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const visible = sales.filter(
    (item) =>
      (!filters.search ||
        normalized(
          `${item.number} ${item.companyName} ${item.opportunityTitle}`,
        ).includes(normalized(filters.search))) &&
      (filters.status === "todos" ||
        (filters.status === "ativos"
          ? !["concluido", "cancelado"].includes(item.projectStatus)
          : item.projectStatus === filters.status)) &&
      (!filters.manager ||
        normalized(
          `${item.projectManager ?? ""} ${item.projectMembers.map((id) => team.find((member) => String(member.id) === id)?.name ?? "").join(" ")}`,
        ).includes(normalized(filters.manager))),
  );
  if (!sales.length)
    return (
      <Empty
        icon={<ClipboardList />}
        title="Nenhum projeto disponível"
        text="Os projetos são criados automaticamente a partir dos pedidos aprovados."
        action="Ver pedidos"
        onClick={() => {}}
      />
    );
  return (
    <>
      <div className="project-flow-note">
        <ClipboardList />
        <div>
          <strong>Acompanhamento operacional</strong>
          <span>
            Cada pedido gera um projeto independente. As tarefas concluídas
            calculam automaticamente o progresso da execução.
          </span>
        </div>
      </div>
      <div className="project-summary">
        <span>
          <strong>
            {
              sales.filter(
                (item) =>
                  !["concluido", "cancelado"].includes(item.projectStatus),
              ).length
            }
          </strong>{" "}
          projetos ativos
        </span>
        <span>
          <strong>
            {sales.filter((item) => item.projectStatus === "andamento").length}
          </strong>{" "}
          em andamento
        </span>
        <span>
          <strong>
            {
              tasks.filter(
                (task) =>
                  !task.completedAt &&
                  task.dueDate &&
                  task.dueDate < new Date().toISOString().slice(0, 10),
              ).length
            }
          </strong>{" "}
          tarefas atrasadas
        </span>
      </div>
      <div className="filter-bar project-filters">
        <Field label="Pedido, cliente ou projeto">
          <Input
            value={filters.search}
            onChange={(event) =>
              setFilters({ ...filters, search: event.target.value })
            }
            placeholder="Buscar projeto..."
          />
        </Field>
        <Field label="Responsável">
          <Input
            value={filters.manager}
            onChange={(event) =>
              setFilters({ ...filters, manager: event.target.value })
            }
            placeholder="Nome do responsável"
          />
        </Field>
        <Field label="Status do projeto">
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters({ ...filters, status: event.target.value })
            }
          >
            <option value="ativos">Projetos ativos</option>
            <option value="todos">Todos</option>
            <option value="aguardando">Aguardando</option>
            <option value="andamento">Em andamento</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </Field>
      </div>
      {visible.length ? (
        <div className="project-grid">
          {visible.map((item) => (
            <ProjectCard
              key={`${item.id}-${item.updatedAt ?? ""}-${item.progress}-${item.projectStatus}`}
              item={item}
              tasks={tasks.filter((task) => task.saleId === item.id)}
              files={files.filter((file) => file.saleId === item.id)}
              team={team}
              update={update}
              addTask={addTask}
              toggleTask={toggleTask}
              deleteTask={deleteTask}
              uploadFile={uploadFile}
              deleteFile={deleteFile}
              saving={saving}
            />
          ))}
        </div>
      ) : (
        <div className="filter-empty">
          Nenhum projeto encontrado com esses filtros.
        </div>
      )}
    </>
  );
}
function ProjectCard({
  item,
  tasks,
  files,
  team,
  update,
  addTask,
  toggleTask,
  deleteTask,
  uploadFile,
  deleteFile,
  saving,
}: {
  item: SaleRecord;
  tasks: ProjectTask[];
  files: ProjectFile[];
  team: TeamMember[];
  update: (sale: SaleRecord, changes: Partial<SaleRecord>) => void;
  addTask: (
    saleId: number,
    task: { title: string; responsible: string; dueDate: string },
  ) => void;
  toggleTask: (task: ProjectTask) => void;
  deleteTask: (task: ProjectTask) => void;
  uploadFile: (saleId: number, file: File) => void;
  deleteFile: (file: ProjectFile) => void;
  saving: boolean;
}) {
  const [taskForm, setTaskForm] = useState({
    title: "",
    responsible: "",
    dueDate: "",
  });
  const [draft, setDraft] = useState(item);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = Boolean(
    item.scheduledEnd &&
    item.scheduledEnd < today &&
    !["concluido", "cancelado"].includes(item.projectStatus),
  );
  const fields: (keyof SaleRecord)[] = [
    "projectStatus",
    "scheduledStart",
    "scheduledEnd",
    "projectManager",
    "projectMembers",
    "progress",
    "projectNotes",
  ];
  const dirty = fields.some((key) => draft[key] !== item[key]);
  const save = () =>
    update(item, {
      projectStatus: draft.projectStatus,
      scheduledStart: draft.scheduledStart,
      scheduledEnd: draft.scheduledEnd,
      projectManager: draft.projectManager,
      projectMembers: draft.projectMembers,
      progress: Number(draft.progress),
      projectNotes: draft.projectNotes,
    });
  const submitTask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskForm.title.trim()) return;
    addTask(item.id, taskForm);
    setTaskForm({ title: "", responsible: "", dueDate: "" });
  };
  const allocated = team.filter((member) =>
    draft.projectMembers.includes(String(member.id)),
  );
  return (
    <article className={`project-card ${overdue ? "overdue" : ""}`}>
      <header>
        <span>
          <ClipboardList />
        </span>
        <div>
          <small>
            {item.number} · Pedido{" "}
            {item.status === "concluido"
              ? "concluído"
              : item.status === "andamento"
                ? "em andamento"
                : item.status === "cancelado"
                  ? "cancelado"
                  : "aguardando"}
          </small>
          <h2>{item.companyName}</h2>
          <p>{item.opportunityTitle}</p>
        </div>
        <b className={`project-status ${draft.projectStatus}`}>
          {overdue
            ? "Atrasado"
            : draft.projectStatus === "andamento"
              ? "Em andamento"
              : draft.projectStatus === "concluido"
                ? "Concluído"
                : draft.projectStatus === "cancelado"
                  ? "Cancelado"
                  : "Aguardando"}
        </b>
      </header>
      <div className={`project-progress ${tasks.length ? "calculated" : ""}`}>
        <div>
          <span>
            Progresso do projeto{" "}
            {tasks.length ? <small>calculado pelas tarefas</small> : null}
          </span>
          <strong>{Number(draft.progress) || 0}%</strong>
        </div>
        <i>
          <b
            style={{
              width: `${Math.min(100, Math.max(0, Number(draft.progress) || 0))}%`,
            }}
          />
        </i>
        {!tasks.length && (
          <input
            aria-label="Progresso do projeto"
            type="range"
            min="0"
            max="100"
            step="5"
            value={Number(draft.progress) || 0}
            onChange={(event) =>
              setDraft({
                ...draft,
                progress: Number(event.target.value),
                projectStatus:
                  Number(event.target.value) > 0 &&
                  draft.projectStatus === "aguardando"
                    ? "andamento"
                    : draft.projectStatus,
              })
            }
          />
        )}
      </div>
      <div className="project-fields">
        <Field label="Status do projeto">
          <select
            value={draft.projectStatus}
            onChange={(event) =>
              setDraft({
                ...draft,
                projectStatus: event.target.value,
                progress:
                  event.target.value === "concluido" ? 100 : draft.progress,
              })
            }
          >
            <option value="aguardando">Aguardando</option>
            <option value="andamento">Em andamento</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </Field>
        <Field label="Gestor do projeto">
          <select
            value={draft.projectManager ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, projectManager: event.target.value || null })
            }
          >
            <option value="">Selecione</option>
            {team.map((member) => (
              <option key={member.id} value={member.name}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Início">
          <Input
            type="date"
            value={draft.scheduledStart ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, scheduledStart: event.target.value || null })
            }
          />
        </Field>
        <Field label="Conclusão prevista">
          <Input
            type="date"
            value={draft.scheduledEnd ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, scheduledEnd: event.target.value || null })
            }
          />
        </Field>
      </div>
      <div className="project-team">
        <span>Equipe técnica</span>
        <div>
          {team.map((member) => (
            <label key={member.id}>
              <input
                type="checkbox"
                checked={draft.projectMembers.includes(String(member.id))}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    projectMembers: event.target.checked
                      ? [...draft.projectMembers, String(member.id)]
                      : draft.projectMembers.filter(
                          (id) => id !== String(member.id),
                        ),
                  })
                }
              />
              <i>{initials(member.name)}</i>
              <b>{member.name}</b>
            </label>
          ))}
        </div>
      </div>
      <Field label="Observações da execução">
        <Textarea
          value={draft.projectNotes ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, projectNotes: event.target.value })
          }
          placeholder="Pendências, alinhamentos e informações importantes do projeto"
        />
      </Field>
      <section className="project-tasks">
        <div className="project-tasks-head">
          <strong>Etapas e tarefas</strong>
          <span>
            {tasks.filter((task) => task.completedAt).length}/{tasks.length}{" "}
            concluídas
          </span>
        </div>
        {tasks.length ? (
          <div className="project-task-list">
            {tasks.map((task) => {
              const taskOverdue = Boolean(
                !task.completedAt && task.dueDate && task.dueDate < today,
              );
              return (
                <div
                  className={`project-task ${task.completedAt ? "done" : ""} ${taskOverdue ? "late" : ""}`}
                  key={task.id}
                >
                  <button
                    type="button"
                    onClick={() => toggleTask(task)}
                    aria-label={
                      task.completedAt ? "Reabrir tarefa" : "Concluir tarefa"
                    }
                  >
                    <CheckCircle2 />
                  </button>
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {task.responsible || "Sem responsável"}
                      {task.dueDate
                        ? ` · ${new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${task.dueDate}T12:00:00Z`))}`
                        : " · Sem prazo"}
                      {taskOverdue ? " · Atrasada" : ""}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="project-task-delete"
                    onClick={() => deleteTask(task)}
                    aria-label="Excluir tarefa"
                  >
                    <Trash2 />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="project-tasks-empty">
            Adicione a primeira tarefa para calcular o progresso
            automaticamente.
          </p>
        )}
        <form className="project-task-form" onSubmit={submitTask}>
          <Input
            value={taskForm.title}
            onChange={(event) =>
              setTaskForm({ ...taskForm, title: event.target.value })
            }
            placeholder="Nova tarefa ou etapa"
            required
          />
          <select
            aria-label="Responsável pela tarefa"
            value={taskForm.responsible}
            onChange={(event) =>
              setTaskForm({ ...taskForm, responsible: event.target.value })
            }
          >
            <option value="">Responsável</option>
            {allocated.map((member) => (
              <option key={member.id} value={member.name}>
                {member.name}
              </option>
            ))}
          </select>
          <Input
            type="date"
            aria-label="Prazo da tarefa"
            value={taskForm.dueDate}
            onChange={(event) =>
              setTaskForm({ ...taskForm, dueDate: event.target.value })
            }
          />
          <Button disabled={saving}>
            <Plus /> Adicionar
          </Button>
        </form>
      </section>
      <section className="project-files">
        <div className="project-files-head">
          <div>
            <Paperclip />
            <span>
              <strong>Documentos e evidências</strong>
              <small>
                {files.length} arquivo{files.length === 1 ? "" : "s"}
              </small>
            </span>
          </div>
          <label className={saving ? "disabled" : ""}>
            <Upload /> Anexar arquivo
            <input
              type="file"
              disabled={saving}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadFile(item.id, file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        {files.length ? (
          <div className="project-file-list">
            {files.map((file) => (
              <div className="project-file" key={file.id}>
                <Paperclip />
                <div>
                  <strong>{file.name}</strong>
                  <small>
                    {(file.size / 1024 / 1024).toFixed(
                      file.size > 1048576 ? 1 : 2,
                    )}{" "}
                    MB · {file.uploadedBy}
                  </small>
                </div>
                <a
                  href={`/api/project-files?id=${file.id}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Baixar ${file.name}`}
                >
                  <Download />
                </a>
                <button
                  type="button"
                  onClick={() => deleteFile(file)}
                  aria-label={`Excluir ${file.name}`}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p>Nenhum documento anexado a este projeto.</p>
        )}
      </section>
      <footer>
        <span>
          {money(item.total)} · {item.items.length} itens
        </span>
        <div>
          <Button
            variant="outline"
            disabled={!dirty}
            onClick={() => setDraft(item)}
          >
            Cancelar alterações
          </Button>
          <Button disabled={!dirty} onClick={save}>
            Salvar projeto
          </Button>
        </div>
      </footer>
    </article>
  );
}
function Sales({
  sales,
  proposals,
  billings,
  update,
  bill,
}: {
  sales: SaleRecord[];
  proposals: ProposalRecord[];
  billings: BillingRecord[];
  update: (sale: SaleRecord, changes: Partial<SaleRecord>) => void;
  bill: (sale: SaleRecord) => void;
}) {
  const [filters, setFilters] = useState({
    number: "",
    client: "",
    status: "",
    from: "",
    to: "",
  });
  if (!sales.length)
    return (
      <Empty
        icon={<ShoppingCart />}
        title="Nenhum pedido gerado"
        text="Aprove uma proposta e use o botão Gerar pedido para iniciar a execução."
        action="Ver propostas aprovadas"
        onClick={() => window.location.reload()}
      />
    );
  const labels: Record<string, string> = {
    aguardando: "Aguardando execução",
    andamento: "Em andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const visible = sales.filter((sale) => {
    const created = sale.createdAt.slice(0, 10),
      proposal = proposals.find((item) => item.id === sale.proposalId);
    return (
      (!filters.number ||
        normalized(`${sale.number} ${proposal?.number ?? ""}`).includes(
          normalized(filters.number),
        )) &&
      (!filters.client ||
        normalized(`${sale.companyName} ${sale.opportunityTitle}`).includes(
          normalized(filters.client),
        )) &&
      (!filters.status || sale.status === filters.status) &&
      (!filters.from || created >= filters.from) &&
      (!filters.to || created <= filters.to)
    );
  });
  return (
    <>
      <div className="filter-bar sales-filters">
        <Field label="Número do pedido / proposta">
          <Input
            placeholder="Ex.: PED-2026"
            value={filters.number}
            onChange={(event) =>
              setFilters({ ...filters, number: event.target.value })
            }
          />
        </Field>
        <Field label="Cliente / projeto">
          <Input
            placeholder="Buscar cliente ou projeto"
            value={filters.client}
            onChange={(event) =>
              setFilters({ ...filters, client: event.target.value })
            }
          />
        </Field>
        <Field label="Status">
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters({ ...filters, status: event.target.value })
            }
          >
            <option value="">Todos</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data inicial">
          <Input
            type="date"
            value={filters.from}
            onChange={(event) =>
              setFilters({ ...filters, from: event.target.value })
            }
          />
        </Field>
        <Field label="Data final">
          <Input
            type="date"
            value={filters.to}
            onChange={(event) =>
              setFilters({ ...filters, to: event.target.value })
            }
          />
        </Field>
      </div>
      {visible.length ? (
        <div className="sales-grid">
          {visible.map((sale) => {
            const margin = sale.total
              ? ((sale.total - sale.cost) / sale.total) * 100
              : 0;
            const proposal = proposals.find(
              (item) => item.id === sale.proposalId,
            );
            return (
              <article className="sale-card" key={sale.id}>
                <div className="sale-head">
                  <span>
                    <ShoppingCart />
                  </span>
                  <div>
                    <small>
                      {sale.number} · {proposal?.number}
                    </small>
                    <h2>{sale.companyName}</h2>
                    <p>{sale.opportunityTitle}</p>
                  </div>
                  <select
                    value={sale.status}
                    onChange={(event) =>
                      update(sale, { status: event.target.value })
                    }
                  >
                    {Object.entries(labels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sale-values">
                  <span>
                    Venda<strong>{money(sale.total)}</strong>
                  </span>
                  <span>
                    Custo<strong>{money(sale.cost)}</strong>
                  </span>
                  <span>
                    Margem<strong>{margin.toFixed(1)}%</strong>
                  </span>
                </div>
                <div className="sale-schedule">
                  <Field label="Início previsto">
                    <Input
                      type="date"
                      value={sale.scheduledStart ?? ""}
                      onChange={(event) =>
                        update(sale, {
                          scheduledStart: event.target.value || null,
                        })
                      }
                    />
                  </Field>
                  <Field label="Conclusão prevista">
                    <Input
                      type="date"
                      value={sale.scheduledEnd ?? ""}
                      onChange={(event) =>
                        update(sale, {
                          scheduledEnd: event.target.value || null,
                        })
                      }
                    />
                  </Field>
                </div>
                {sale.status === "concluido" &&
                  !billings.some((item) => item.saleId === sale.id) && (
                    <Button
                      className="billing-button"
                      onClick={() => bill(sale)}
                    >
                      <ReceiptText /> Preparar faturamento
                    </Button>
                  )}
                <footer>
                  <span>{sale.items.length} itens</span>
                  <strong>{labels[sale.status]}</strong>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="filter-empty">
          Nenhum pedido encontrado com esses filtros.
        </div>
      )}
    </>
  );
}
function EquipmentCatalog({ items, add, edit, remove }: {
  items: EquipmentCatalogItem[]; add: () => void;
  edit: (item: EquipmentCatalogItem) => void; remove: (item: EquipmentCatalogItem) => void;
}) {
  if (!items.length) return <Empty icon={<Wrench />} title="Nenhum equipamento ou peça" text="Cadastre os itens técnicos para utilizá-los nas ordens de serviço." action="Cadastrar equipamento" onClick={add} />;
  return <div className="catalog-list">
    <div className="catalog-table-head"><span>Item</span><span>Marca</span><span>Modelo</span><span>Unidade</span><span>Custo</span><span /></div>
    {items.map((item) => <article className="catalog-row" key={item.id}>
      <div><small>{item.code || "Sem código"}</small><strong>{item.description}</strong><em>{[item.serialNumber && `Serial: ${item.serialNumber}`, item.inventoryNumber && `Patrimônio: ${item.inventoryNumber}`].filter(Boolean).join(" · ")}</em></div>
      <span>{item.brand || "—"}</span><span>{item.model || "—"}</span><span>{item.unit}</span><span>{money(item.cost)}</span>
      <div className="record-actions"><button aria-label={`Editar ${item.description}`} onClick={() => edit(item)}><Pencil /></button><button className="danger" aria-label={`Excluir ${item.description}`} onClick={() => remove(item)}><Trash2 /></button></div>
    </article>)}
  </div>;
}
function Catalog({
  catalog,
  add,
  edit,
  remove,
}: {
  catalog: CatalogItem[];
  add: () => void;
  edit: (item: CatalogItem) => void;
  remove: (item: CatalogItem) => void;
}) {
  if (!catalog.length)
    return (
      <Empty
        icon={<PackageOpen />}
        title="Catálogo vazio"
        text="Cadastre materiais e serviços com custos e três níveis de preço."
        action="Cadastrar item"
        onClick={add}
      />
    );
  const margin = (price: number, cost: number) =>
    price ? Math.round(((price - cost) / price) * 100) : 0;
  return (
    <div className="catalog-list">
      <div className="catalog-table-head">
        <span>Item</span>
        <span>Custo</span>
        <span>Competitiva</span>
        <span>Padrão</span>
        <span>Valor agregado</span>
        <span />
      </div>
      {catalog.map((item) => (
        <article className="catalog-row" key={item.id}>
          <div>
            <small>
              {catalogCategoryLabel(item.category)}
              {item.code ? ` · ${item.code}` : ""}
            </small>
            <strong>{item.description}</strong>
            <em>por {item.unit}</em>
          </div>
          <span>{money(item.cost)}</span>
          <span>
            <strong>{money(item.competitivePrice)}</strong>
            <small>{margin(item.competitivePrice, item.cost)}% margem</small>
          </span>
          <span>
            <strong>{money(item.standardPrice)}</strong>
            <small>{margin(item.standardPrice, item.cost)}% margem</small>
          </span>
          <span>
            <strong>{money(item.valuePrice)}</strong>
            <small>{margin(item.valuePrice, item.cost)}% margem</small>
          </span>
          <div className="record-actions">
            <button
              aria-label={`Editar ${item.description}`}
              onClick={() => edit(item)}
            >
              <Pencil />
            </button>
            <button
              className="danger"
              aria-label={`Excluir ${item.description}`}
              onClick={() => remove(item)}
            >
              <Trash2 />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
function CatalogPicker({
  catalog,
  priceTable,
  onSelect,
}: {
  catalog: CatalogItem[];
  priceTable: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const results = catalog
    .filter((item) => item.category !== "equipamento")
    .filter((item) =>
      `${item.code ?? ""} ${item.description} ${item.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .slice(0, 20);
  const price = (item: CatalogItem) =>
    priceTable === "competitiva"
      ? item.competitivePrice
      : priceTable === "valor"
        ? item.valuePrice
        : item.standardPrice;
  return (
    <div className="catalog-picker">
      <Search />
      <input
        value={search}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Digite código, produto ou serviço..."
        aria-label="Buscar no catálogo"
        autoComplete="off"
      />
      {open && (
        <div className="catalog-picker-results" role="listbox">
          {results.length ? (
            results.map((item) => (
              <button
                type="button"
                role="option"
                aria-selected="false"
                key={item.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(String(item.id));
                  setSearch("");
                  setOpen(false);
                }}
              >
                <span>
                  <small>
                    {catalogCategoryLabel(item.category)}
                    {item.code ? ` · ${item.code}` : ""}
                  </small>
                  <strong>{item.description}</strong>
                </span>
                <b>{money(price(item))}</b>
              </button>
            ))
          ) : (
            <p>Nenhum item encontrado.</p>
          )}
        </div>
      )}
    </div>
  );
}
function Proposals({
  proposals,
  add,
  inspect,
}: {
  proposals: ProposalRecord[];
  add: () => void;
  inspect: (proposal: ProposalRecord) => void;
}) {
  const labels: Record<string, string> = {
    rascunho: "Rascunho",
    enviada: "Enviada",
    aprovada: "Aprovada",
    recusada: "Recusada",
    expirada: "Expirada",
  };
  const [filters, setFilters] = useState({
    client: "",
    opportunity: "",
    status: "",
    from: "",
    to: "",
  });
  if (!proposals.length)
    return (
      <Empty
        icon={<FileText />}
        title="Nenhuma proposta cadastrada"
        text="Crie uma proposta direta para um cliente ou vinculada a uma oportunidade."
        action="Criar proposta"
        onClick={add}
      />
    );
  const filtered = proposals.filter(
    (item) =>
      (!filters.client ||
        item.companyName
          .toLowerCase()
          .includes(filters.client.toLowerCase())) &&
      (!filters.opportunity ||
        item.opportunityTitle
          .toLowerCase()
          .includes(filters.opportunity.toLowerCase())) &&
      (!filters.status || item.status === filters.status) &&
      (!filters.from || item.createdAt.slice(0, 10) >= filters.from) &&
      (!filters.to || item.createdAt.slice(0, 10) <= filters.to),
  );
  return (
    <>
      <div className="filter-bar proposal-filters">
        <Input
          placeholder="Cliente"
          value={filters.client}
          onChange={(e) => setFilters({ ...filters, client: e.target.value })}
        />
        <Input
          placeholder="Oportunidade"
          value={filters.opportunity}
          onChange={(e) =>
            setFilters({ ...filters, opportunity: e.target.value })
          }
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">Todos os status</option>
          {Object.entries(labels).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <Input
          type="date"
          aria-label="Data inicial"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
        />
        <Input
          type="date"
          aria-label="Data final"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
        />
      </div>
      {filtered.length ? (
        <div className="proposal-grid">
          {filtered.map((proposal) => (
            <article
              className="proposal-card"
              key={proposal.id}
              onClick={() => inspect(proposal)}
            >
              <div className="proposal-card-head">
                <span>
                  <FileText />
                </span>
                <div>
                  <small>{proposal.number}</small>
                  <h2>{proposal.companyName}</h2>
                </div>
                <b className={`proposal-status ${proposal.status}`}>
                  {labels[proposal.status]}
                </b>
              </div>
              <p>{proposal.opportunityTitle}</p>
              <div className="proposal-breakdown">
                <span>
                  Materiais{" "}
                  <strong>
                    {money(
                      proposal.items
                        .filter((item) => item.category === "material")
                        .reduce(
                          (sum, item) => sum + Number(item.total ?? 0),
                          0,
                        ),
                    )}
                  </strong>
                </span>
                <span>
                  Serviços{" "}
                  <strong>
                    {money(
                      proposal.items
                        .filter((item) => item.category === "servico")
                        .reduce(
                          (sum, item) => sum + Number(item.total ?? 0),
                          0,
                        ),
                    )}
                  </strong>
                </span>
              </div>
              <div className="proposal-card-total">
                <span>
                  {proposal.customerOrder
                    ? `Pedido ${proposal.customerOrder}`
                    : labels[proposal.status]}
                </span>
                <div>
                  <small>
                    {proposal.discount
                      ? `Desconto: ${money(proposal.discount)}`
                      : "Sem desconto"}
                  </small>
                  <strong>{money(proposal.total)}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="filter-empty">
          Nenhuma proposta encontrada com esses filtros.
        </div>
      )}
    </>
  );
}
function Activities({
  activities,
  add,
  toggle,
  remove,
}: {
  activities: ActivityRecord[];
  add: () => void;
  toggle: (activity: ActivityRecord) => void;
  remove: (activity: ActivityRecord) => void;
}) {
  const typeLabels: Record<string, string> = {
    ligacao: "Ligação",
    reuniao: "Reunião",
    visita: "Visita técnica",
    proposta: "Envio de proposta",
    retorno: "Retorno",
    outro: "Outro",
  };
  if (!activities.length)
    return (
      <Empty
        icon={<CalendarClock />}
        title="Nenhuma atividade cadastrada"
        text="Registre o próximo passo de uma oportunidade para organizar sua rotina comercial."
        action="Cadastrar atividade"
        onClick={add}
      />
    );
  const sorted = [...activities].sort(
    (a, b) =>
      Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) ||
      String(a.dueAt ?? "9999").localeCompare(String(b.dueAt ?? "9999")),
  );
  return (
    <div className="activity-list">
      <div className="activity-summary">
        <strong>{activities.filter((item) => !item.completedAt).length}</strong>
        <span>atividades pendentes</span>
        <i />
        <strong>{activities.filter((item) => item.completedAt).length}</strong>
        <span>concluídas</span>
      </div>
      {sorted.map((activity) => {
        const overdue = Boolean(
          activity.dueAt &&
          !activity.completedAt &&
          new Date(activity.dueAt) < new Date(),
        );
        return (
          <article
            className={`activity-card ${activity.completedAt ? "completed" : ""}`}
            key={activity.id}
          >
            <button
              className="activity-check"
              onClick={() => toggle(activity)}
              aria-label={
                activity.completedAt
                  ? "Reabrir atividade"
                  : "Concluir atividade"
              }
            >
              <CheckCircle2 />
            </button>
            <div className="activity-main">
              <div className="activity-tags">
                <span>{typeLabels[activity.type] ?? activity.type}</span>
                {overdue && <b>Atrasada</b>}
              </div>
              <h3>{activity.description}</h3>
              <p>
                <Building2 /> {activity.companyName} ·{" "}
                {activity.opportunityTitle}
              </p>
            </div>
            <div className="activity-side">
              <span className="activity-date">
                <CalendarClock />
                {activity.dueAt
                  ? new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(activity.dueAt))
                  : "Sem prazo"}
              </span>
              <button
                className="activity-delete"
                onClick={() => remove(activity)}
                aria-label="Excluir atividade"
              >
                <Trash2 />
              </button>
            </div>
          </article>
        );
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
