import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { serviceCallExpenses, serviceCallFiles, serviceCalls } from "./schema";
import { serviceCallTechnicians, serviceTechnicians } from "./service-technician-schema";

export const serviceFieldExecutions = sqliteTable("service_field_executions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assignmentId: integer("assignment_id").notNull().unique().references(() => serviceCallTechnicians.id, { onDelete: "cascade" }),
  serviceCallId: integer("service_call_id").notNull().references(() => serviceCalls.id, { onDelete: "cascade" }),
  technicianId: integer("technician_id").notNull().references(() => serviceTechnicians.id),
  status: text("status").notNull().default("assigned"),
  invitedAt: text("invited_at"), acceptedAt: text("accepted_at"), declinedAt: text("declined_at"),
  expectedArrivalAt: text("expected_arrival_at"), departedAt: text("departed_at"), arrivedAt: text("arrived_at"),
  checkedInAt: text("checked_in_at"), startedAt: text("started_at"), finishedAt: text("finished_at"),
  checkedOutAt: text("checked_out_at"), closedAt: text("closed_at"),
  checkInLatitude: real("check_in_latitude"), checkInLongitude: real("check_in_longitude"),
  checkOutLatitude: real("check_out_latitude"), checkOutLongitude: real("check_out_longitude"),
  declineReason: text("decline_reason"), returnReason: text("return_reason"), technicianReport: text("technician_report"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_service_field_execution_call").on(table.serviceCallId, table.status),
  index("idx_service_field_execution_tech").on(table.technicianId, table.status),
]);

export const serviceFieldEvents = sqliteTable("service_field_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  executionId: integer("execution_id").notNull().references(() => serviceFieldExecutions.id, { onDelete: "cascade" }),
  serviceCallId: integer("service_call_id").notNull().references(() => serviceCalls.id, { onDelete: "cascade" }),
  technicianId: integer("technician_id").notNull().references(() => serviceTechnicians.id),
  eventType: text("event_type").notNull(),
  occurredAt: text("occurred_at").notNull(),
  latitude: real("latitude"), longitude: real("longitude"),
  note: text("note"), performedBy: text("performed_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_service_field_events_execution").on(table.executionId, table.occurredAt)]);

export const serviceFieldEvidences = sqliteTable("service_field_evidences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  executionId: integer("execution_id").notNull().references(() => serviceFieldExecutions.id, { onDelete: "cascade" }),
  serviceCallId: integer("service_call_id").notNull().references(() => serviceCalls.id, { onDelete: "cascade" }),
  fileId: integer("file_id").references(() => serviceCallFiles.id, { onDelete: "set null" }),
  evidenceType: text("evidence_type").notNull().default("photo"),
  title: text("title").notNull(), description: text("description"), url: text("url"),
  capturedAt: text("captured_at").notNull(), uploadedBy: text("uploaded_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_service_field_evidences_execution").on(table.executionId, table.createdAt)]);

export const serviceFieldExpenseLinks = sqliteTable("service_field_expense_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  executionId: integer("execution_id").notNull().references(() => serviceFieldExecutions.id, { onDelete: "cascade" }),
  expenseId: integer("expense_id").notNull().unique().references(() => serviceCallExpenses.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_service_field_expense_execution").on(table.executionId)]);
