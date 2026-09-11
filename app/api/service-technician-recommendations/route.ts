import { eq } from "drizzle-orm";
import { requireServiceCostAccess } from "@/app/service-technician-access";
import { resolveTechnicianCost } from "@/app/service-technician-costing";
import { ensureServiceTechnicianTables } from "@/app/service-technician-runtime";
import { ensureServiceTechnicianOperationalTables, SERVICE_TECHNICIAN_SKILLS } from "@/app/service-technician-operational-runtime";
import { getDb } from "@/db";
import { serviceCalls } from "@/db/schema";
import { serviceCallTechnicians, serviceTechnicians } from "@/db/service-technician-schema";
import {
  serviceTechnicianAbsences,
  serviceTechnicianCertificates,
  serviceTechnicianOperationalProfiles,
  serviceTechnicianRegions,
  serviceTechnicianSkills,
} from "@/db/service-technician-operational-schema";

const skillLabels = new Map<string, string>(SERVICE_TECHNICIAN_SKILLS.map(([code, label]) => [code, label]));
const clean = (value: string | null | undefined) => (value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const skillPatterns: Array<{ code: string; patterns: RegExp[] }> = [
  { code: "fiber", patterns: [/\bfibra\b/, /optica/, /otdr/, /fusao/] },
  { code: "wifi", patterns: [/wi fi/, /wifi/, /wireless/, /access point/, /site survey/] },
  { code: "cctv", patterns: [/cftv/, /camera/, /dvr/, /nvr/, /seguranca eletronica/] },
  { code: "structured_cabling", patterns: [/cabeamento/, /patch panel/, /cat ?6/, /utp/, /rj45/] },
  { code: "data_center", patterns: [/data ?center/, /servidor/, /storage/, /rack de servidor/] },
  { code: "cybersecurity", patterns: [/ciber/, /cyber/, /firewall/, /fortinet/, /fortigate/, /seguranca da informacao/] },
  { code: "iot", patterns: [/\biot\b/, /sensor/, /esp32/, /telemetria/, /monitoramento/] },
  { code: "telecom", patterns: [/telecom/, /telefonia/, /voip/, /pabx/, /sip/] },
  { code: "network", patterns: [/\brede\b/, /switch/, /roteador/, /router/, /vlan/, /lan\b/] },
  { code: "infra_it", patterns: [/infraestrutura de ti/, /infra ti/, /backup/, /virtualizacao/] },
  { code: "field_service", patterns: [/field service/, /visita tecnica/, /atendimento tecnico/] },
];

function deriveRequirements(call: typeof serviceCalls.$inferSelect) {
  const haystack = clean([call.serviceType, call.subject, call.description, call.executedService, call.location].filter(Boolean).join(" "));
  const detected = skillPatterns.filter((entry) => entry.patterns.some((pattern) => pattern.test(haystack))).map((entry) => entry.code);
  const requiredSkills = [...new Set(detected.length ? detected : ["field_service"] )];
  const requiredCertificates: string[] = [];
  if (/nr ?35|trabalho em altura|telhado|poste|torre/.test(haystack)) requiredCertificates.push("NR35");
  if (/nr ?10|eletric|energia|quadro eletrico|disjuntor/.test(haystack)) requiredCertificates.push("NR10");
  return { haystack, requiredSkills, primarySkill: requiredSkills[0], requiredCertificates };
}

function targetMoment(call: typeof serviceCalls.$inferSelect) {
  const source = call.scheduledAt || call.createdAt || new Date().toISOString();
  const date = source.slice(0, 10);
  const timeMatch = /T(\d{2}):(\d{2})/.exec(source);
  const time = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  let instant: Date;
  if (call.scheduledAt) {
    const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(call.scheduledAt)
      ? call.scheduledAt
      : `${call.scheduledAt}${call.scheduledAt.length === 16 ? ":00" : ""}-03:00`;
    instant = new Date(normalized);
  } else instant = new Date(call.createdAt || Date.now());
  if (Number.isNaN(instant.getTime())) instant = new Date(`${date}T12:00:00-03:00`);
  return { date, time, day, instant };
}

function parseDays(raw: string | null | undefined) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [];
  } catch { return []; }
}

function certificateValid(certificate: { certificateType: string; expiresAt: string | null; active: boolean }, required: string, targetDate: string) {
  return certificate.active && clean(certificate.certificateType) === clean(required) && (!certificate.expiresAt || certificate.expiresAt >= targetDate);
}

function locationMatches(location: string, matchText: string) {
  const expected = clean(matchText);
  if (!expected) return false;
  return location.includes(expected) || expected.split(" ").filter((part) => part.length >= 3).every((part) => location.includes(part));
}

export async function GET(request: Request) {
  const denied = await requireServiceCostAccess();
  if (denied) return denied;
  try {
    await ensureServiceTechnicianTables();
    await ensureServiceTechnicianOperationalTables();
    const url = new URL(request.url);
    const serviceCallId = Number(url.searchParams.get("serviceCallId"));
    if (!serviceCallId) return Response.json({ error: "Informe a OS para recomendar técnicos." }, { status: 400 });
    const db = getDb();
    const [[call], technicians, profiles, skills, regions, certificates, absences, assignments, allCalls] = await Promise.all([
      db.select().from(serviceCalls).where(eq(serviceCalls.id, serviceCallId)).limit(1),
      db.select().from(serviceTechnicians),
      db.select().from(serviceTechnicianOperationalProfiles),
      db.select().from(serviceTechnicianSkills),
      db.select().from(serviceTechnicianRegions),
      db.select().from(serviceTechnicianCertificates),
      db.select().from(serviceTechnicianAbsences),
      db.select().from(serviceCallTechnicians),
      db.select().from(serviceCalls),
    ]);
    if (!call) return Response.json({ error: "OS não encontrada." }, { status: 404 });

    const requirements = deriveRequirements(call);
    const moment = targetMoment(call);
    const location = clean(call.location);
    const profileByTechnician = new Map(profiles.map((row) => [row.technicianId, row]));
    const callById = new Map(allCalls.map((row) => [row.id, row]));
    const activeTechnicians = technicians.filter((row) => row.active);

    const costResults = await Promise.all(activeTechnicians.map(async (technician) => {
      try {
        const calculation = await resolveTechnicianCost({ serviceCallId, technicianId: technician.id, hours: 1, quantity: 1, equipmentQty: 0 });
        return { technicianId: technician.id, cost: calculation.total, source: calculation.source, remunerationType: calculation.remunerationType };
      } catch {
        return { technicianId: technician.id, cost: 0, source: "unavailable", remunerationType: null };
      }
    }));
    const costByTechnician = new Map(costResults.map((row) => [row.technicianId, row]));
    const configuredCosts = costResults.filter((row) => row.source !== "unconfigured" && row.source !== "unavailable" && row.cost >= 0).map((row) => row.cost);
    const minCost = configuredCosts.length ? Math.min(...configuredCosts) : 0;
    const maxCost = configuredCosts.length ? Math.max(...configuredCosts) : 0;

    const candidates = activeTechnicians.map((technician) => {
      const profile = profileByTechnician.get(technician.id) ?? null;
      const technicianSkills = skills.filter((row) => row.technicianId === technician.id && row.active);
      const technicianRegions = regions.filter((row) => row.technicianId === technician.id && row.active);
      const technicianCertificates = certificates.filter((row) => row.technicianId === technician.id && row.active);
      const technicianAbsences = absences.filter((row) => row.technicianId === technician.id && row.active);
      const blockers: string[] = [];
      const reasons: string[] = [];

      const effectiveAvailability = profile?.availabilityUntil && moment.date > profile.availabilityUntil ? "available" : profile?.availability ?? "available";
      if (effectiveAvailability === "unavailable") blockers.push("Perfil marcado como indisponível para a data");
      else if (effectiveAvailability === "limited") reasons.push("Disponibilidade limitada");
      else reasons.push("Disponível no perfil operacional");

      const overlappingAbsence = technicianAbsences.find((absence) => {
        const start = new Date(absence.startsAt).getTime();
        const end = new Date(absence.endsAt).getTime();
        return moment.instant.getTime() >= start && moment.instant.getTime() <= end;
      });
      if (overlappingAbsence) blockers.push(`Indisponibilidade programada: ${overlappingAbsence.reason || overlappingAbsence.absenceType}`);

      if (profile) {
        const workDays = parseDays(profile.workDays);
        if (workDays.length && !workDays.includes(moment.day)) blockers.push("Data fora dos dias de trabalho cadastrados");
        if (moment.time && profile.workStart && profile.workEnd && (moment.time < profile.workStart || moment.time > profile.workEnd)) reasons.push(`Horário fora da jornada padrão ${profile.workStart}-${profile.workEnd}`);
      }

      const levelBySkill = new Map(technicianSkills.map((row) => [row.skillCode, row.level]));
      const primaryLevel = levelBySkill.get(requirements.primarySkill) ?? 0;
      if (primaryLevel <= 0) blockers.push(`Sem competência cadastrada em ${skillLabels.get(requirements.primarySkill) ?? requirements.primarySkill}`);
      else reasons.push(`${skillLabels.get(requirements.primarySkill) ?? requirements.primarySkill}: nível ${primaryLevel}`);
      const supportingLevels = requirements.requiredSkills.slice(1).map((code) => levelBySkill.get(code) ?? 0);

      const missingCertificates = requirements.requiredCertificates.filter((required) => !technicianCertificates.some((certificate) => certificateValid(certificate, required, moment.date)));
      missingCertificates.forEach((required) => blockers.push(`${required} válido não cadastrado para a data`));
      if (requirements.requiredCertificates.length && !missingCertificates.length) reasons.push(`Documentos obrigatórios válidos: ${requirements.requiredCertificates.join(", ")}`);

      const requiredRegions = technicianRegions.filter((row) => row.coverageMode === "required");
      const preferredRegions = technicianRegions.filter((row) => row.coverageMode !== "required");
      const requiredRegionMatch = !requiredRegions.length || requiredRegions.some((row) => locationMatches(location, row.matchText));
      const preferredRegionMatch = preferredRegions.some((row) => locationMatches(location, row.matchText));
      const baseMatch = Boolean(profile && ((profile.baseCity && location.includes(clean(profile.baseCity))) || (profile.baseState && location.includes(clean(profile.baseState)))));
      if (!requiredRegionMatch) blockers.push("Local fora das regiões obrigatórias cadastradas");
      if (requiredRegions.length && requiredRegionMatch) reasons.push("Local coberto por região obrigatória");
      else if (preferredRegionMatch) reasons.push("Local dentro de região preferencial");
      else if (baseMatch) reasons.push("Local compatível com a base do técnico");
      else if (!technicianRegions.length) reasons.push("Sem restrição regional cadastrada");

      const technicianAssignments = assignments.filter((row) => row.technicianId === technician.id && row.assignmentStatus !== "cancelled");
      const openAssignments = technicianAssignments.filter((row) => {
        const linked = callById.get(row.serviceCallId);
        return linked && !["concluido", "cancelado"].includes(linked.status) && linked.id !== call.id;
      });
      const sameDayAssignments = openAssignments.filter((row) => (callById.get(row.serviceCallId)?.scheduledAt || "").slice(0, 10) === moment.date);
      if (sameDayAssignments.length) reasons.push(`${sameDayAssignments.length} atendimento(s) já programado(s) no dia`);

      const cost = costByTechnician.get(technician.id) ?? { cost: 0, source: "unavailable", remunerationType: null };
      const costConfigured = cost.source !== "unconfigured" && cost.source !== "unavailable";
      if (costConfigured) reasons.push(`Custo previsto ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cost.cost)}`);
      else reasons.push("Custo ainda sem tabela/regra configurada");

      const skillScore = primaryLevel <= 0 ? 0 : primaryLevel === 3 ? 45 : primaryLevel === 2 ? 36 : 24;
      const supportBonus = supportingLevels.length ? Math.min(5, supportingLevels.reduce((sum, level) => sum + Math.max(0, level), 0)) : 0;
      const availabilityScore = effectiveAvailability === "available" ? 15 : effectiveAvailability === "limited" ? 8 : 0;
      const regionScore = requiredRegions.length ? (requiredRegionMatch ? 15 : 0) : preferredRegionMatch ? 15 : baseMatch ? 11 : technicianRegions.length ? 5 : 8;
      let costScore = 3;
      if (costConfigured) {
        if (maxCost <= minCost + 0.01) costScore = 15;
        else costScore = 5 + 10 * (1 - (cost.cost - minCost) / (maxCost - minCost));
      }
      const loadScore = Math.max(0, 10 - sameDayAssignments.length * 4 - Math.max(0, openAssignments.length - sameDayAssignments.length) * 0.5);
      const schedulePenalty = reasons.some((reason) => reason.startsWith("Horário fora")) ? 5 : 0;
      const rawScore = skillScore + supportBonus + availabilityScore + regionScore + costScore + loadScore - schedulePenalty;
      const score = Number(Math.max(0, Math.min(100, rawScore)).toFixed(1));

      return {
        technicianId: technician.id,
        technicianName: technician.name,
        relationshipType: technician.relationshipType,
        financialMode: technician.financialMode,
        eligible: blockers.length === 0,
        score,
        primarySkill: requirements.primarySkill,
        primarySkillLabel: skillLabels.get(requirements.primarySkill) ?? requirements.primarySkill,
        skillLevel: primaryLevel,
        availability: effectiveAvailability,
        regionMatch: requiredRegions.length ? requiredRegionMatch : preferredRegionMatch || baseMatch,
        sameDayLoad: sameDayAssignments.length,
        openLoad: openAssignments.length,
        cost: cost.cost,
        costConfigured,
        costSource: cost.source,
        remunerationType: cost.remunerationType,
        ownVehicle: profile?.ownVehicle ?? false,
        vehicleType: profile?.vehicleType ?? null,
        baseCity: profile?.baseCity ?? null,
        baseState: profile?.baseState ?? null,
        blockers,
        reasons,
      };
    }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || (a.costConfigured ? a.cost : Number.MAX_SAFE_INTEGER) - (b.costConfigured ? b.cost : Number.MAX_SAFE_INTEGER) || a.technicianName.localeCompare(b.technicianName, "pt-BR"));

    const eligible = candidates.filter((row) => row.eligible);
    const first = eligible[0] ?? null;
    const second = eligible[1] ?? null;
    const gap = first && second ? first.score - second.score : first ? first.score : 0;
    const confidence = !first ? "none" : first.score >= 75 && gap >= 8 ? "high" : first.score >= 60 ? "medium" : "low";

    return Response.json({
      call: { id: call.id, number: call.number, companyName: call.companyName, location: call.location, serviceType: call.serviceType, subject: call.subject, scheduledAt: call.scheduledAt, status: call.status },
      requirements: {
        requiredSkills: requirements.requiredSkills.map((code) => ({ code, label: skillLabels.get(code) ?? code })),
        primarySkill: requirements.primarySkill,
        requiredCertificates: requirements.requiredCertificates,
        targetDate: moment.date,
        targetTime: moment.time,
      },
      recommendation: first,
      confidence,
      scoreGap: Number(gap.toFixed(1)),
      candidates,
      methodology: {
        weights: { competence: 45, availability: 15, region: 15, cost: 15, load: 10 },
        note: "Custo ordena, mas não supera bloqueios de competência, disponibilidade, região obrigatória ou certificado exigido.",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível calcular a recomendação de técnicos." }, { status: 503 });
  }
}
