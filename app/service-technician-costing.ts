import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { serviceCalls } from "@/db/schema";
import { serviceTechnicianRateRules, serviceTechnicians } from "@/db/service-technician-schema";

export const serviceRemunerationTypes = [
  "per_visit",
  "per_hour",
  "daily",
  "fixed_service",
  "per_equipment",
  "monthly_allocation",
] as const;

export type ServiceRemunerationType = (typeof serviceRemunerationTypes)[number];

const clean = (value: string | null | undefined) => (value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

const nonNegative = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

function serviceDate(call: typeof serviceCalls.$inferSelect) {
  return (call.scheduledAt || call.createdAt || new Date().toISOString()).slice(0, 10);
}

function serviceHour(call: typeof serviceCalls.$inferSelect) {
  const source = call.scheduledAt || "";
  const match = /T(\d{2}):/.exec(source);
  return match ? Number(match[1]) : null;
}

function isWeekend(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export async function resolveTechnicianCost(args: {
  serviceCallId: number;
  technicianId: number;
  hours?: number;
  quantity?: number;
  equipmentQty?: number;
  negotiatedAmount?: number | null;
  reimbursementAmount?: number;
}) {
  const db = getDb();
  const [[call], [technician], rules] = await Promise.all([
    db.select().from(serviceCalls).where(eq(serviceCalls.id, args.serviceCallId)).limit(1),
    db.select().from(serviceTechnicians).where(eq(serviceTechnicians.id, args.technicianId)).limit(1),
    db.select().from(serviceTechnicianRateRules),
  ]);
  if (!call) throw new Error("OS não encontrada para cálculo do custo técnico.");
  if (!technician || !technician.active) throw new Error("Técnico não encontrado ou inativo.");

  const date = serviceDate(call);
  const hour = serviceHour(call);
  const hours = Math.max(0, nonNegative(args.hours, 1));
  const quantity = Math.max(0, nonNegative(args.quantity, 1));
  const equipmentQty = Math.max(0, nonNegative(args.equipmentQty, 0));
  const reimbursementAmount = Math.max(0, nonNegative(args.reimbursementAmount, 0));
  const location = clean(call.location);
  const serviceType = clean(call.serviceType);

  const candidates = rules
    .filter((rule) => rule.active)
    .filter((rule) => rule.technicianId === null || rule.technicianId === technician.id)
    .filter((rule) => rule.companyId === null || rule.companyId === call.companyId)
    .filter((rule) => !rule.serviceType || clean(rule.serviceType) === serviceType)
    .filter((rule) => !rule.region || location.includes(clean(rule.region)))
    .filter((rule) => !rule.effectiveFrom || rule.effectiveFrom <= date)
    .filter((rule) => !rule.effectiveTo || rule.effectiveTo >= date)
    .map((rule) => ({
      rule,
      score:
        (rule.technicianId === technician.id ? 100 : 0) +
        (rule.companyId === call.companyId && rule.companyId !== null ? 30 : 0) +
        (rule.serviceType ? 20 : 0) +
        (rule.region ? 10 : 0) +
        Number(rule.priority || 0),
    }))
    .sort((a, b) =>
      b.score - a.score ||
      String(b.rule.effectiveFrom ?? "").localeCompare(String(a.rule.effectiveFrom ?? "")) ||
      b.rule.id - a.rule.id,
    );

  const selected = candidates[0]?.rule ?? null;
  const negotiated = args.negotiatedAmount !== null && args.negotiatedAmount !== undefined
    ? nonNegative(args.negotiatedAmount)
    : null;

  let remunerationType: ServiceRemunerationType | null = selected?.remunerationType as ServiceRemunerationType | undefined ?? null;
  let rateAmount = selected ? nonNegative(selected.amount) : 0;
  let baseAmount = 0;
  let surchargeAmount = 0;
  let source = selected ? "rate_rule" : "unconfigured";

  if (negotiated !== null) {
    remunerationType = "fixed_service";
    rateAmount = negotiated;
    baseAmount = negotiated;
    source = "negotiated_override";
  } else if (selected) {
    const minimumHours = nonNegative(selected.minimumHours);
    if (remunerationType === "per_hour") baseAmount = rateAmount * Math.max(hours, minimumHours);
    else if (remunerationType === "per_equipment") baseAmount = rateAmount * equipmentQty;
    else if (remunerationType === "daily") baseAmount = rateAmount * Math.max(1, quantity);
    else if (remunerationType === "monthly_allocation") baseAmount = rateAmount * hours;
    else baseAmount = rateAmount * Math.max(1, quantity);

    const weekendPct = isWeekend(date) ? nonNegative(selected.weekendSurchargePct) : 0;
    const nightPct = hour !== null && (hour >= 20 || hour < 6) ? nonNegative(selected.nightSurchargePct) : 0;
    surchargeAmount = baseAmount * ((weekendPct + nightPct) / 100);
  } else if (technician.monthlyCost && technician.monthlyProductiveHours > 0) {
    remunerationType = "monthly_allocation";
    rateAmount = technician.monthlyCost / technician.monthlyProductiveHours;
    baseAmount = rateAmount * hours;
    source = "monthly_profile";
  }

  const total = Math.max(0, baseAmount + surchargeAmount + reimbursementAmount);
  const costNature = technician.financialMode === "per_service" ? "payable" : "managerial";

  return {
    call,
    technician,
    rule: selected,
    source,
    serviceDate: date,
    remunerationType,
    rateAmount: Number(rateAmount.toFixed(2)),
    baseAmount: Number(baseAmount.toFixed(2)),
    surchargeAmount: Number(surchargeAmount.toFixed(2)),
    reimbursementAmount: Number(reimbursementAmount.toFixed(2)),
    total: Number(total.toFixed(2)),
    costNature,
    hours,
    quantity,
    equipmentQty,
  };
}
