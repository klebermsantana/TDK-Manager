import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { companies, payables, serviceCalls, suppliers, users } from "./schema";

export const serviceTechnicians = sqliteTable(
  "service_technicians",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    document: text("document"),
    email: text("email"),
    phone: text("phone"),
    relationshipType: text("relationship_type").notNull().default("freelancer"),
    financialMode: text("financial_mode").notNull().default("per_service"),
    paymentMethod: text("payment_method"),
    pixKey: text("pix_key"),
    dueDays: integer("due_days").notNull().default(7),
    requiresInvoice: integer("requires_invoice", { mode: "boolean" }).notNull().default(false),
    monthlyCost: real("monthly_cost"),
    monthlyProductiveHours: real("monthly_productive_hours").notNull().default(160),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_service_technicians_active").on(table.active, table.name),
    index("idx_service_technicians_relationship").on(table.relationshipType, table.financialMode),
    index("idx_service_technicians_user").on(table.userId),
    index("idx_service_technicians_supplier").on(table.supplierId),
  ],
);

export const serviceTechnicianRateRules = sqliteTable(
  "service_technician_rate_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    technicianId: integer("technician_id").references(() => serviceTechnicians.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
    serviceType: text("service_type"),
    region: text("region"),
    remunerationType: text("remuneration_type").notNull().default("per_visit"),
    amount: real("amount").notNull().default(0),
    minimumHours: real("minimum_hours").notNull().default(0),
    nightSurchargePct: real("night_surcharge_pct").notNull().default(0),
    weekendSurchargePct: real("weekend_surcharge_pct").notNull().default(0),
    priority: integer("priority").notNull().default(0),
    effectiveFrom: text("effective_from"),
    effectiveTo: text("effective_to"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_service_technician_rates_tech").on(table.technicianId, table.active),
    index("idx_service_technician_rates_context").on(table.companyId, table.serviceType, table.active),
    index("idx_service_technician_rates_effective").on(table.effectiveFrom, table.effectiveTo),
  ],
);

export const serviceCallTechnicians = sqliteTable(
  "service_call_technicians",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    serviceCallId: integer("service_call_id").notNull().references(() => serviceCalls.id, { onDelete: "cascade" }),
    technicianId: integer("technician_id").notNull().references(() => serviceTechnicians.id),
    role: text("role").notNull().default("primary"),
    assignmentStatus: text("assignment_status").notNull().default("assigned"),
    assignedAt: text("assigned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    hours: real("hours").notNull().default(1),
    quantity: real("quantity").notNull().default(1),
    equipmentQty: real("equipment_qty").notNull().default(0),
    negotiatedAmount: real("negotiated_amount"),
    rateRuleId: integer("rate_rule_id").references(() => serviceTechnicianRateRules.id, { onDelete: "set null" }),
    remunerationTypeSnapshot: text("remuneration_type_snapshot"),
    rateAmountSnapshot: real("rate_amount_snapshot"),
    surchargeAmount: real("surcharge_amount").notNull().default(0),
    reimbursementAmount: real("reimbursement_amount").notNull().default(0),
    expectedCost: real("expected_cost").notNull().default(0),
    realizedCost: real("realized_cost"),
    costNature: text("cost_nature").notNull().default("payable"),
    apportionmentStatus: text("apportionment_status").notNull().default("planned"),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    payableId: integer("payable_id").references(() => payables.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_service_call_technician").on(table.serviceCallId, table.technicianId),
    index("idx_service_call_technicians_call").on(table.serviceCallId, table.assignmentStatus),
    index("idx_service_call_technicians_tech").on(table.technicianId, table.apportionmentStatus),
    index("idx_service_call_technicians_payable").on(table.payableId),
  ],
);

export const serviceTechnicianAudit = sqliteTable(
  "service_technician_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    technicianId: integer("technician_id").references(() => serviceTechnicians.id, { onDelete: "set null" }),
    assignmentId: integer("assignment_id").references(() => serviceCallTechnicians.id, { onDelete: "set null" }),
    serviceCallId: integer("service_call_id").references(() => serviceCalls.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    performedBy: text("performed_by").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_service_technician_audit_tech").on(table.technicianId, table.createdAt),
    index("idx_service_technician_audit_assignment").on(table.assignmentId, table.createdAt),
    index("idx_service_technician_audit_call").on(table.serviceCallId, table.createdAt),
  ],
);
