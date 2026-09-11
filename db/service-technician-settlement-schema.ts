import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { payables, serviceCalls, suppliers } from "./schema";
import { serviceCallTechnicians, serviceTechnicians } from "./service-technician-schema";

export const serviceTechnicianSettlements = sqliteTable(
  "service_technician_settlements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    technicianId: integer("technician_id")
      .notNull()
      .references(() => serviceTechnicians.id),
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    periodFrom: text("period_from").notNull(),
    periodTo: text("period_to").notNull(),
    status: text("status").notNull().default("draft"),
    invoiceNumber: text("invoice_number"),
    invoiceDate: text("invoice_date"),
    subtotal: real("subtotal").notNull().default(0),
    reimbursementTotal: real("reimbursement_total").notNull().default(0),
    adjustmentTotal: real("adjustment_total").notNull().default(0),
    totalAmount: real("total_amount").notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    notes: text("notes"),
    submittedBy: text("submitted_by"),
    submittedAt: text("submitted_at"),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    dueDate: text("due_date"),
    payableId: integer("payable_id").references(() => payables.id, { onDelete: "set null" }),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_service_technician_settlements_tech").on(table.technicianId, table.status),
    index("idx_service_technician_settlements_period").on(table.periodFrom, table.periodTo),
    index("idx_service_technician_settlements_payable").on(table.payableId),
  ],
);

export const serviceTechnicianSettlementItems = sqliteTable(
  "service_technician_settlement_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    settlementId: integer("settlement_id")
      .notNull()
      .references(() => serviceTechnicianSettlements.id, { onDelete: "cascade" }),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => serviceCallTechnicians.id),
    serviceCallId: integer("service_call_id")
      .notNull()
      .references(() => serviceCalls.id),
    approvedAmountSnapshot: real("approved_amount_snapshot").notNull().default(0),
    reimbursementSnapshot: real("reimbursement_snapshot").notNull().default(0),
    settlementAmount: real("settlement_amount").notNull().default(0),
    divergenceAmount: real("divergence_amount").notNull().default(0),
    divergenceReason: text("divergence_reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_service_technician_settlement_item").on(table.settlementId, table.assignmentId),
    index("idx_service_technician_settlement_items_assignment").on(table.assignmentId),
    index("idx_service_technician_settlement_items_call").on(table.serviceCallId),
  ],
);

export const serviceTechnicianSettlementAudit = sqliteTable(
  "service_technician_settlement_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    settlementId: integer("settlement_id").references(() => serviceTechnicianSettlements.id, { onDelete: "set null" }),
    itemId: integer("item_id").references(() => serviceTechnicianSettlementItems.id, { onDelete: "set null" }),
    technicianId: integer("technician_id").references(() => serviceTechnicians.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    performedBy: text("performed_by").notNull(),
    note: text("note"),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_service_technician_settlement_audit_settlement").on(table.settlementId, table.createdAt),
    index("idx_service_technician_settlement_audit_tech").on(table.technicianId, table.createdAt),
  ],
);
