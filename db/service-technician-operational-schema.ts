import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { serviceTechnicians } from "./service-technician-schema";

export const serviceTechnicianOperationalProfiles = sqliteTable(
  "service_technician_operational_profiles",
  {
    technicianId: integer("technician_id").primaryKey().references(() => serviceTechnicians.id, { onDelete: "cascade" }),
    availability: text("availability").notNull().default("available"),
    availabilityUntil: text("availability_until"),
    baseCity: text("base_city"),
    baseState: text("base_state"),
    serviceRadiusKm: real("service_radius_km").notNull().default(50),
    regionMode: text("region_mode").notNull().default("preferred"),
    workDays: text("work_days").notNull().default("[1,2,3,4,5]"),
    workStart: text("work_start").notNull().default("08:00"),
    workEnd: text("work_end").notNull().default("18:00"),
    ownVehicle: integer("own_vehicle", { mode: "boolean" }).notNull().default(false),
    vehicleType: text("vehicle_type"),
    vehiclePlate: text("vehicle_plate"),
    operationalNotes: text("operational_notes"),
    updatedBy: text("updated_by"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_service_technician_operational_availability").on(table.availability, table.availabilityUntil),
    index("idx_service_technician_operational_base").on(table.baseState, table.baseCity),
  ],
);

export const serviceTechnicianSkills = sqliteTable(
  "service_technician_skills",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    technicianId: integer("technician_id").notNull().references(() => serviceTechnicians.id, { onDelete: "cascade" }),
    skillCode: text("skill_code").notNull(),
    level: integer("level").notNull().default(2),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_service_technician_skill").on(table.technicianId, table.skillCode),
    index("idx_service_technician_skill_code").on(table.skillCode, table.active, table.level),
  ],
);

export const serviceTechnicianRegions = sqliteTable(
  "service_technician_regions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    technicianId: integer("technician_id").notNull().references(() => serviceTechnicians.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    matchText: text("match_text").notNull(),
    coverageMode: text("coverage_mode").notNull().default("preferred"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_service_technician_regions_tech").on(table.technicianId, table.active),
    index("idx_service_technician_regions_mode").on(table.coverageMode, table.active),
  ],
);

export const serviceTechnicianCertificates = sqliteTable(
  "service_technician_certificates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    technicianId: integer("technician_id").notNull().references(() => serviceTechnicians.id, { onDelete: "cascade" }),
    certificateType: text("certificate_type").notNull(),
    documentNumber: text("document_number"),
    issuedAt: text("issued_at"),
    expiresAt: text("expires_at"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_service_technician_certificates_tech").on(table.technicianId, table.active),
    index("idx_service_technician_certificates_type").on(table.certificateType, table.expiresAt, table.active),
  ],
);

export const serviceTechnicianAbsences = sqliteTable(
  "service_technician_absences",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    technicianId: integer("technician_id").notNull().references(() => serviceTechnicians.id, { onDelete: "cascade" }),
    absenceType: text("absence_type").notNull().default("unavailable"),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    reason: text("reason"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_service_technician_absences_tech").on(table.technicianId, table.active, table.startsAt, table.endsAt),
    index("idx_service_technician_absences_period").on(table.startsAt, table.endsAt, table.active),
  ],
);

export const serviceTechnicianOperationalAudit = sqliteTable(
  "service_technician_operational_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    technicianId: integer("technician_id").references(() => serviceTechnicians.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    performedBy: text("performed_by").notNull(),
    note: text("note"),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_service_technician_operational_audit_tech").on(table.technicianId, table.createdAt)],
);
