import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  externalId: text("external_id").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  jobTitle: text("job_title"),
  role: text("role").notNull().default("seller"),
  permissions: text("permissions").notNull().default('["crm"]'),
  managerId: integer("manager_id"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  document: text("document"),
  segment: text("segment"),
  preferredPriceTable: text("preferred_price_table")
    .notNull()
    .default("padrao"),
  isClient: integer("is_client", { mode: "boolean" }).notNull().default(true),
  isServiceTaker: integer("is_service_taker", { mode: "boolean" })
    .notNull()
    .default(true),
  isServiceLocation: integer("is_service_location", { mode: "boolean" })
    .notNull()
    .default(true),
  logoStorageKey: text("logo_storage_key"),
  logoContentType: text("logo_content_type"),
  logoName: text("logo_name"),
  ownerId: integer("owner_id").references(() => users.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  name: text("name").notNull(),
  role: text("role"),
  email: text("email"),
  phone: text("phone"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const opportunities = sqliteTable("opportunities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  companyId: integer("company_id").references(() => companies.id),
  companyName: text("company_name").notNull(),
  value: real("value").notNull().default(0),
  stage: text("stage").notNull().default("novo"),
  probability: integer("probability").notNull().default(10),
  temperature: text("temperature").notNull().default("warm"),
  ownerId: integer("owner_id").references(() => users.id),
  ownerName: text("owner_name").notNull(),
  expectedCloseAt: text("expected_close_at"),
  lostReason: text("lost_reason"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const activities = sqliteTable("activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  opportunityId: integer("opportunity_id")
    .notNull()
    .references(() => opportunities.id),
  userId: integer("user_id").references(() => users.id),
  type: text("type").notNull(),
  description: text("description").notNull(),
  dueAt: text("due_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const catalogItems = sqliteTable("catalog_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  code: text("code"),
  description: text("description").notNull(),
  unit: text("unit").notNull().default("un"),
  cost: real("cost").notNull().default(0),
  competitivePrice: real("competitive_price").notNull().default(0),
  standardPrice: real("standard_price").notNull().default(0),
  valuePrice: real("value_price").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const equipmentItems = sqliteTable("equipment_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code"),
  description: text("description").notNull(),
  brand: text("brand"),
  model: text("model"),
  serialNumber: text("serial_number"),
  inventoryNumber: text("inventory_number"),
  unit: text("unit").notNull().default("un"),
  cost: real("cost").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const proposals = sqliteTable("proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  opportunityId: integer("opportunity_id").references(() => opportunities.id),
  companyId: integer("company_id").references(() => companies.id),
  number: text("number").notNull().unique(),
  customerOrder: text("customer_order"),
  requester: text("requester"),
  status: text("status").notNull().default("rascunho"),
  priceTable: text("price_table").notNull().default("padrao"),
  validUntil: text("valid_until"),
  discount: real("discount").notNull().default(0),
  subtotal: real("subtotal").notNull().default(0),
  total: real("total").notNull().default(0),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const proposalItems = sqliteTable("proposal_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proposalId: integer("proposal_id")
    .notNull()
    .references(() => proposals.id),
  catalogId: integer("catalog_id").references(() => catalogItems.id),
  category: text("category").notNull(),
  description: text("description").notNull(),
  quantity: real("quantity").notNull().default(1),
  unitCost: real("unit_cost").notNull().default(0),
  unitPrice: real("unit_price").notNull().default(0),
  total: real("total").notNull().default(0),
});
export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proposalId: integer("proposal_id")
    .notNull()
    .unique()
    .references(() => proposals.id),
  opportunityId: integer("opportunity_id").references(() => opportunities.id),
  number: text("number").notNull().unique(),
  companyName: text("company_name").notNull(),
  opportunityTitle: text("opportunity_title").notNull(),
  status: text("status").notNull().default("aguardando"),
  projectStatus: text("project_status").notNull().default("aguardando"),
  scheduledStart: text("scheduled_start"),
  scheduledEnd: text("scheduled_end"),
  projectManager: text("project_manager"),
  projectMembers: text("project_members").notNull().default("[]"),
  progress: integer("progress").notNull().default(0),
  projectNotes: text("project_notes"),
  subtotal: real("subtotal").notNull(),
  discount: real("discount").notNull().default(0),
  total: real("total").notNull(),
  cost: real("cost").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const saleItems = sqliteTable("sale_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id")
    .notNull()
    .references(() => sales.id),
  category: text("category").notNull(),
  description: text("description").notNull(),
  quantity: real("quantity").notNull(),
  unitCost: real("unit_cost").notNull().default(0),
  unitPrice: real("unit_price").notNull(),
  total: real("total").notNull(),
});
export const projectTasks = sqliteTable(
  "project_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    saleId: integer("sale_id")
      .notNull()
      .references(() => sales.id),
    title: text("title").notNull(),
    responsible: text("responsible"),
    dueDate: text("due_date"),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_project_tasks_sale").on(table.saleId),
    index("idx_project_tasks_due").on(table.dueDate),
  ],
);
export const projectFiles = sqliteTable(
  "project_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    saleId: integer("sale_id")
      .notNull()
      .references(() => sales.id),
    name: text("name").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_project_files_sale").on(table.saleId)],
);
export const serviceLocations = sqliteTable(
  "service_locations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    address: text("address").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_service_locations_company").on(table.companyId)],
);
export const serviceCalls = sqliteTable(
  "service_calls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    number: text("number").notNull().unique(),
    companyId: integer("company_id").references(() => companies.id),
    serviceTakerCompanyId: integer("service_taker_company_id").references(
      () => companies.id,
    ),
    companyName: text("company_name").notNull(),
    serviceTaker: text("service_taker"),
    requestOrigin: text("request_origin"),
    department: text("department"),
    customerTicket: text("customer_ticket"),
    saleId: integer("sale_id").references(() => sales.id),
    location: text("location"),
    locationId: integer("location_id").references(() => serviceLocations.id),
    locationCompanyId: integer("location_company_id").references(
      () => companies.id,
    ),
    contactName: text("contact_name"),
    technician: text("technician"),
    serviceType: text("service_type").notNull().default("visita"),
    priority: text("priority").notNull().default("normal"),
    scheduledAt: text("scheduled_at"),
    status: text("status").notNull().default("triagem"),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    executedService: text("executed_service"),
    consumablesUsed: integer("consumables_used", { mode: "boolean" })
      .notNull()
      .default(false),
    consumablesDescription: text("consumables_description"),
    partsReplaced: integer("parts_replaced", { mode: "boolean" })
      .notNull()
      .default(false),
    partsDescription: text("parts_description"),
    expensesAmount: real("expenses_amount").notNull().default(0),
    expensesDescription: text("expenses_description"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_service_calls_status").on(table.status),
    index("idx_service_calls_company").on(table.companyId),
    index("idx_service_calls_scheduled").on(table.scheduledAt),
  ],
);
export const serviceCallHistory = sqliteTable(
  "service_call_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    serviceCallId: integer("service_call_id")
      .notNull()
      .references(() => serviceCalls.id),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedBy: text("changed_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_service_call_history_call").on(table.serviceCallId)],
);
export const serviceCallFiles = sqliteTable(
  "service_call_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    serviceCallId: integer("service_call_id")
      .notNull()
      .references(() => serviceCalls.id),
    name: text("name").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_service_call_files_call").on(table.serviceCallId)],
);
export const serviceCallServices = sqliteTable(
  "service_call_services",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    serviceCallId: integer("service_call_id")
      .notNull()
      .references(() => serviceCalls.id),
    catalogId: integer("catalog_id").references(() => catalogItems.id),
    description: text("description").notNull(),
    quantity: real("quantity").notNull().default(1),
    unit: text("unit").notNull().default("serviço"),
    technician: text("technician"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_service_call_services_call").on(table.serviceCallId)],
);
export const serviceCallMaterials = sqliteTable(
  "service_call_materials",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    serviceCallId: integer("service_call_id")
      .notNull()
      .references(() => serviceCalls.id),
    catalogId: integer("catalog_id").references(() => catalogItems.id),
    description: text("description").notNull(),
    quantity: real("quantity").notNull().default(1),
    unit: text("unit").notNull().default("un"),
    unitCost: real("unit_cost").notNull().default(0),
    unitPrice: real("unit_price").notNull().default(0),
    priceTable: text("price_table").notNull().default("padrao"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_service_call_materials_call").on(table.serviceCallId)],
);
export const serviceCallEquipment = sqliteTable(
  "service_call_equipment",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    serviceCallId: integer("service_call_id")
      .notNull()
      .references(() => serviceCalls.id),
    catalogId: integer("catalog_id").references(() => catalogItems.id),
    equipmentItemId: integer("equipment_item_id").references(
      () => equipmentItems.id,
    ),
    description: text("description").notNull(),
    brandModel: text("brand_model"),
    quantity: real("quantity").notNull().default(1),
    removedSerial: text("removed_serial"),
    installedSerial: text("installed_serial"),
    reason: text("reason"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_service_call_equipment_call").on(table.serviceCallId)],
);
export const serviceCallExpenses = sqliteTable(
  "service_call_expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    serviceCallId: integer("service_call_id")
      .notNull()
      .references(() => serviceCalls.id),
    category: text("category").notNull().default("outros"),
    description: text("description").notNull(),
    amount: real("amount").notNull().default(0),
    expenseDate: text("expense_date").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_service_call_expenses_call").on(table.serviceCallId)],
);
export const billings = sqliteTable("billings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id")
    .notNull()
    .unique()
    .references(() => sales.id),
  number: text("number").notNull().unique(),
  status: text("status").notNull().default("pendente"),
  paymentTerms: text("payment_terms").notNull().default("À vista"),
  installments: integer("installments").notNull().default(1),
  dueDate: text("due_date"),
  materialInvoice: text("material_invoice"),
  serviceInvoice: text("service_invoice"),
  materialAmount: real("material_amount").notNull().default(0),
  serviceAmount: real("service_amount").notNull().default(0),
  total: real("total").notNull(),
  receivedAmount: real("received_amount").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const receivables = sqliteTable("receivables", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  billingId: integer("billing_id")
    .notNull()
    .references(() => billings.id),
  installmentNumber: integer("installment_number").notNull(),
  amount: real("amount").notNull(),
  dueDate: text("due_date").notNull(),
  receivedAmount: real("received_amount").notNull().default(0),
  paymentDate: text("payment_date"),
  interest: real("interest").notNull().default(0),
  penalty: real("penalty").notNull().default(0),
  discount: real("discount").notNull().default(0),
  status: text("status").notNull().default("aberto"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  document: text("document"),
  email: text("email"),
  phone: text("phone"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const payables = sqliteTable(
  "payables",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    companyId: integer("company_id").references(() => companies.id),
    project: text("project"),
    groupNumber: text("group_number").notNull(),
    reference: text("reference"),
    description: text("description").notNull(),
    category: text("category").notNull().default("outros"),
    installmentNumber: integer("installment_number").notNull().default(1),
    installmentCount: integer("installment_count").notNull().default(1),
    amount: real("amount").notNull(),
    dueDate: text("due_date").notNull(),
    paidAmount: real("paid_amount").notNull().default(0),
    paymentDate: text("payment_date"),
    status: text("status").notNull().default("aberto"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_payables_due_date").on(table.dueDate),
    index("idx_payables_supplier_status").on(table.supplierId, table.status),
    index("idx_payables_company").on(table.companyId),
  ],
);
export const companySettings = sqliteTable("company_settings", {
  id: integer("id").primaryKey(),
  companyName: text("company_name")
    .notNull()
    .default("TDK Soluções que Transformam"),
  document: text("document"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  defaultPriceTable: text("default_price_table").notNull().default("padrao"),
  proposalValidityDays: integer("proposal_validity_days").notNull().default(15),
  defaultPaymentTerms: text("default_payment_terms")
    .notNull()
    .default("A prazo"),
  defaultInstallments: integer("default_installments").notNull().default(1),
  defaultDueDays: integer("default_due_days").notNull().default(30),
  proposalNotes: text("proposal_notes"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const goals = sqliteTable(
  "goals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    target: real("target").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_goals_period").on(table.startsAt, table.endsAt)],
);
