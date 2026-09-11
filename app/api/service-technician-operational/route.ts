import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requireServiceCostAccess } from "@/app/service-technician-access";
import { ensureServiceTechnicianTables } from "@/app/service-technician-runtime";
import {
  ensureServiceTechnicianOperationalTables,
  SERVICE_TECHNICIAN_CERTIFICATES,
  SERVICE_TECHNICIAN_SKILLS,
} from "@/app/service-technician-operational-runtime";
import { getDb } from "@/db";
import { serviceTechnicians } from "@/db/service-technician-schema";
import {
  serviceTechnicianAbsences,
  serviceTechnicianCertificates,
  serviceTechnicianOperationalAudit,
  serviceTechnicianOperationalProfiles,
  serviceTechnicianRegions,
  serviceTechnicianSkills,
} from "@/db/service-technician-operational-schema";

const text = (value: unknown) => String(value ?? "").trim();
const dateKey = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : null;
const dateTime = (value: unknown) => {
  const raw = text(value);
  if (!raw) return null;
  const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(raw)
    ? raw
    : `${raw}${raw.length === 16 ? ":00" : ""}-03:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const hhmm = (value: unknown, fallback: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(text(value)) ? text(value) : fallback;
const skillCodes = new Set<string>(SERVICE_TECHNICIAN_SKILLS.map(([code]) => code));
const certificateTypes = new Set(SERVICE_TECHNICIAN_CERTIFICATES.map((item) => item.toLowerCase()));
const availabilityValues = new Set(["available", "limited", "unavailable"]);
const absenceTypes = new Set(["vacation", "day_off", "training", "occupied", "unavailable", "other"]);

function parseWorkDays(value: unknown) {
  const raw = Array.isArray(value) ? value : (() => { try { return JSON.parse(text(value) || "[]"); } catch { return []; } })();
  const days = Array.isArray(raw) ? [...new Set(raw.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort() : [];
  return days.length ? days : [1, 2, 3, 4, 5];
}

function todaySaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number) {
  const target = new Date(`${date}T12:00:00Z`);
  target.setUTCDate(target.getUTCDate() + days);
  return target.toISOString().slice(0, 10);
}

async function audit(args: { technicianId: number; action: string; performedBy: string; note?: string | null; before?: unknown; after?: unknown }) {
  await getDb().insert(serviceTechnicianOperationalAudit).values({
    technicianId: args.technicianId,
    action: args.action,
    performedBy: args.performedBy,
    note: args.note ?? null,
    beforeJson: args.before === undefined ? null : JSON.stringify(args.before),
    afterJson: args.after === undefined ? null : JSON.stringify(args.after),
  });
}

async function ensureTechnician(id: number) {
  const [technician] = await getDb().select().from(serviceTechnicians).where(eq(serviceTechnicians.id, id)).limit(1);
  return technician ?? null;
}

export async function GET() {
  const denied = await requireServiceCostAccess();
  if (denied) return denied;
  try {
    await ensureServiceTechnicianTables();
    await ensureServiceTechnicianOperationalTables();
    const db = getDb();
    const [technicians, profiles, skills, regions, certificates, absences, auditRows] = await Promise.all([
      db.select().from(serviceTechnicians),
      db.select().from(serviceTechnicianOperationalProfiles),
      db.select().from(serviceTechnicianSkills),
      db.select().from(serviceTechnicianRegions),
      db.select().from(serviceTechnicianCertificates),
      db.select().from(serviceTechnicianAbsences),
      db.select().from(serviceTechnicianOperationalAudit),
    ]);
    const profileByTechnician = new Map(profiles.map((row) => [row.technicianId, row]));
    const today = todaySaoPaulo();
    const soon = addDays(today, 30);
    const enriched = technicians.map((technician) => ({
      ...technician,
      operationalProfile: profileByTechnician.get(technician.id) ?? {
        technicianId: technician.id,
        availability: "available",
        availabilityUntil: null,
        baseCity: null,
        baseState: null,
        serviceRadiusKm: 50,
        regionMode: "preferred",
        workDays: "[1,2,3,4,5]",
        workStart: "08:00",
        workEnd: "18:00",
        ownVehicle: false,
        vehicleType: null,
        vehiclePlate: null,
        operationalNotes: null,
      },
      skills: skills.filter((row) => row.technicianId === technician.id && row.active),
      regions: regions.filter((row) => row.technicianId === technician.id && row.active),
      certificates: certificates.filter((row) => row.technicianId === technician.id && row.active).map((row) => ({
        ...row,
        validityStatus: !row.expiresAt ? "no_expiry" : row.expiresAt < today ? "expired" : row.expiresAt <= soon ? "expiring" : "valid",
      })),
      absences: absences.filter((row) => row.technicianId === technician.id && row.active).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return Response.json({
      technicians: enriched,
      skillCatalog: SERVICE_TECHNICIAN_SKILLS.map(([code, label]) => ({ code, label })),
      certificateCatalog: SERVICE_TECHNICIAN_CERTIFICATES,
      audit: auditRows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100),
      summary: {
        total: technicians.filter((row) => row.active).length,
        unavailable: enriched.filter((row) => row.active && row.operationalProfile.availability === "unavailable").length,
        withoutSkills: enriched.filter((row) => row.active && row.skills.length === 0).length,
        expiredCertificates: enriched.reduce((total, row) => total + row.certificates.filter((certificate) => certificate.validityStatus === "expired").length, 0),
        expiringCertificates: enriched.reduce((total, row) => total + row.certificates.filter((certificate) => certificate.validityStatus === "expiring").length, 0),
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar o cadastro operacional." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await requireServiceCostAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureServiceTechnicianTables();
    await ensureServiceTechnicianOperationalTables();
    const payload = await request.json() as Record<string, unknown>;
    const action = text(payload.action);
    const technicianId = Number(payload.technicianId);
    if (!technicianId || !await ensureTechnician(technicianId)) return Response.json({ error: "Técnico não encontrado." }, { status: 404 });
    const db = getDb();
    const now = new Date().toISOString();

    if (action === "skill") {
      const skillCode = text(payload.skillCode);
      const level = Math.max(1, Math.min(3, Number(payload.level) || 2));
      if (!skillCodes.has(skillCode)) return Response.json({ error: "Competência inválida." }, { status: 400 });
      const [existing] = (await db.select().from(serviceTechnicianSkills).where(eq(serviceTechnicianSkills.technicianId, technicianId))).filter((row) => row.skillCode === skillCode);
      let row;
      if (existing) {
        [row] = await db.update(serviceTechnicianSkills).set({ level, active: true, notes: text(payload.notes) || null, updatedAt: now }).where(eq(serviceTechnicianSkills.id, existing.id)).returning();
      } else {
        [row] = await db.insert(serviceTechnicianSkills).values({ technicianId, skillCode, level, notes: text(payload.notes) || null, updatedAt: now }).returning();
      }
      await audit({ technicianId, action: "skill_saved", performedBy: auth.email, note: `${skillCode} · nível ${level}`, before: existing, after: row });
      return Response.json({ skill: row }, { status: existing ? 200 : 201 });
    }

    if (action === "region") {
      const label = text(payload.label);
      const matchText = text(payload.matchText) || label;
      const coverageMode = text(payload.coverageMode) === "required" ? "required" : "preferred";
      if (!label || !matchText) return Response.json({ error: "Informe a região e o texto de correspondência." }, { status: 400 });
      const [row] = await db.insert(serviceTechnicianRegions).values({ technicianId, label, matchText, coverageMode, notes: text(payload.notes) || null, updatedAt: now }).returning();
      await audit({ technicianId, action: "region_added", performedBy: auth.email, note: `${label} · ${coverageMode}`, after: row });
      return Response.json({ region: row }, { status: 201 });
    }

    if (action === "certificate") {
      const rawType = text(payload.certificateType);
      const normalizedType = rawType.toLowerCase();
      const certificateType = certificateTypes.has(normalizedType) ? SERVICE_TECHNICIAN_CERTIFICATES.find((item) => item.toLowerCase() === normalizedType)! : rawType;
      if (!certificateType) return Response.json({ error: "Informe o tipo do documento/certificado." }, { status: 400 });
      const issuedAt = payload.issuedAt ? dateKey(payload.issuedAt) : null;
      const expiresAt = payload.expiresAt ? dateKey(payload.expiresAt) : null;
      if ((payload.issuedAt && !issuedAt) || (payload.expiresAt && !expiresAt)) return Response.json({ error: "Data de emissão ou vencimento inválida." }, { status: 400 });
      if (issuedAt && expiresAt && expiresAt < issuedAt) return Response.json({ error: "O vencimento não pode ser anterior à emissão." }, { status: 400 });
      const [row] = await db.insert(serviceTechnicianCertificates).values({
        technicianId,
        certificateType,
        documentNumber: text(payload.documentNumber) || null,
        issuedAt,
        expiresAt,
        notes: text(payload.notes) || null,
        updatedAt: now,
      }).returning();
      await audit({ technicianId, action: "certificate_added", performedBy: auth.email, note: `${certificateType}${expiresAt ? ` · vence ${expiresAt}` : ""}`, after: row });
      return Response.json({ certificate: row }, { status: 201 });
    }

    if (action === "absence") {
      const absenceType = text(payload.absenceType) || "unavailable";
      const startsAt = dateTime(payload.startsAt);
      const endsAt = dateTime(payload.endsAt);
      if (!absenceTypes.has(absenceType) || !startsAt || !endsAt || endsAt <= startsAt) return Response.json({ error: "Informe um período de indisponibilidade válido." }, { status: 400 });
      const [row] = await db.insert(serviceTechnicianAbsences).values({
        technicianId,
        absenceType,
        startsAt,
        endsAt,
        reason: text(payload.reason) || null,
        createdBy: auth.email,
        updatedAt: now,
      }).returning();
      await audit({ technicianId, action: "absence_added", performedBy: auth.email, note: `${absenceType} · ${startsAt} até ${endsAt}`, after: row });
      return Response.json({ absence: row }, { status: 201 });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o cadastro operacional." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireServiceCostAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureServiceTechnicianTables();
    await ensureServiceTechnicianOperationalTables();
    const payload = await request.json() as Record<string, unknown>;
    const action = text(payload.action);
    const technicianId = Number(payload.technicianId);
    if (!technicianId || !await ensureTechnician(technicianId)) return Response.json({ error: "Técnico não encontrado." }, { status: 404 });
    const db = getDb();
    const now = new Date().toISOString();

    if (action === "profile") {
      const availability = availabilityValues.has(text(payload.availability)) ? text(payload.availability) : "available";
      const availabilityUntil = payload.availabilityUntil ? dateKey(payload.availabilityUntil) : null;
      if (payload.availabilityUntil && !availabilityUntil) return Response.json({ error: "Data de disponibilidade inválida." }, { status: 400 });
      const serviceRadiusKm = Math.max(0, Math.min(3000, Number(payload.serviceRadiusKm) || 0));
      const values = {
        availability,
        availabilityUntil,
        baseCity: text(payload.baseCity) || null,
        baseState: text(payload.baseState).toUpperCase().slice(0, 2) || null,
        serviceRadiusKm,
        regionMode: text(payload.regionMode) === "required" ? "required" : "preferred",
        workDays: JSON.stringify(parseWorkDays(payload.workDays)),
        workStart: hhmm(payload.workStart, "08:00"),
        workEnd: hhmm(payload.workEnd, "18:00"),
        ownVehicle: Boolean(payload.ownVehicle),
        vehicleType: text(payload.vehicleType) || null,
        vehiclePlate: text(payload.vehiclePlate).toUpperCase() || null,
        operationalNotes: text(payload.operationalNotes) || null,
        updatedBy: auth.email,
        updatedAt: now,
      };
      const [before] = await db.select().from(serviceTechnicianOperationalProfiles).where(eq(serviceTechnicianOperationalProfiles.technicianId, technicianId)).limit(1);
      let profile;
      if (before) [profile] = await db.update(serviceTechnicianOperationalProfiles).set(values).where(eq(serviceTechnicianOperationalProfiles.technicianId, technicianId)).returning();
      else [profile] = await db.insert(serviceTechnicianOperationalProfiles).values({ technicianId, ...values }).returning();
      await audit({ technicianId, action: "profile_saved", performedBy: auth.email, before, after: profile });
      return Response.json({ profile });
    }

    if (["remove_skill", "remove_region", "remove_certificate", "cancel_absence"].includes(action)) {
      const id = Number(payload.id);
      if (!id) return Response.json({ error: "Registro inválido." }, { status: 400 });
      if (action === "remove_skill") {
        const [before] = await db.select().from(serviceTechnicianSkills).where(eq(serviceTechnicianSkills.id, id)).limit(1);
        if (!before || before.technicianId !== technicianId) return Response.json({ error: "Competência não encontrada." }, { status: 404 });
        const [row] = await db.update(serviceTechnicianSkills).set({ active: false, updatedAt: now }).where(eq(serviceTechnicianSkills.id, id)).returning();
        await audit({ technicianId, action, performedBy: auth.email, before, after: row });
        return Response.json({ skill: row });
      }
      if (action === "remove_region") {
        const [before] = await db.select().from(serviceTechnicianRegions).where(eq(serviceTechnicianRegions.id, id)).limit(1);
        if (!before || before.technicianId !== technicianId) return Response.json({ error: "Região não encontrada." }, { status: 404 });
        const [row] = await db.update(serviceTechnicianRegions).set({ active: false, updatedAt: now }).where(eq(serviceTechnicianRegions.id, id)).returning();
        await audit({ technicianId, action, performedBy: auth.email, before, after: row });
        return Response.json({ region: row });
      }
      if (action === "remove_certificate") {
        const [before] = await db.select().from(serviceTechnicianCertificates).where(eq(serviceTechnicianCertificates.id, id)).limit(1);
        if (!before || before.technicianId !== technicianId) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
        const [row] = await db.update(serviceTechnicianCertificates).set({ active: false, updatedAt: now }).where(eq(serviceTechnicianCertificates.id, id)).returning();
        await audit({ technicianId, action, performedBy: auth.email, before, after: row });
        return Response.json({ certificate: row });
      }
      const [before] = await db.select().from(serviceTechnicianAbsences).where(eq(serviceTechnicianAbsences.id, id)).limit(1);
      if (!before || before.technicianId !== technicianId) return Response.json({ error: "Indisponibilidade não encontrada." }, { status: 404 });
      const [row] = await db.update(serviceTechnicianAbsences).set({ active: false, updatedAt: now }).where(eq(serviceTechnicianAbsences.id, id)).returning();
      await audit({ technicianId, action, performedBy: auth.email, before, after: row });
      return Response.json({ absence: row });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o cadastro operacional." }, { status: 500 });
  }
}
