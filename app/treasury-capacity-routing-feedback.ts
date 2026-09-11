import { treasuryCapacityRoutingFeedback } from "@/db/treasury-capacity-routing-schema";
import { treasuryCapacityAlertOccurrences } from "@/db/treasury-routing-schema";

export const routingFeedbackReasons = ["competence", "availability", "workload", "coverage", "context", "other"] as const;
export type RoutingFeedbackReason = (typeof routingFeedbackReasons)[number];
export type RoutingFeedbackValue = "positive" | "negative";

type FeedbackRow = typeof treasuryCapacityRoutingFeedback.$inferSelect;
type Occurrence = typeof treasuryCapacityAlertOccurrences.$inferSelect;

const positiveWeight: Record<RoutingFeedbackReason, number> = {
  competence: -0.35,
  availability: -0.25,
  workload: -0.25,
  coverage: -0.4,
  context: -0.3,
  other: -0.2,
};

const negativeWeight: Record<RoutingFeedbackReason, number> = {
  competence: 0.8,
  availability: 0.35,
  workload: 0.3,
  coverage: 0.35,
  context: 0.65,
  other: 0.45,
};

export const routingFeedbackReasonLabels: Record<RoutingFeedbackReason, string> = {
  competence: "Competência",
  availability: "Disponibilidade",
  workload: "Carga",
  coverage: "Cobertura programada",
  context: "Contexto do risco",
  other: "Outro",
};

function ageDays(createdAt: string, now: Date) {
  return Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 86_400_000);
}

function decayFactor(days: number) {
  if (days <= 30) return 1;
  if (days <= 90) return 0.7;
  if (days <= 180) return 0.4;
  return 0.2;
}

function matchesContext(row: FeedbackRow, occurrence: Occurrence) {
  if (occurrence.domain) return row.domain === occurrence.domain;
  return row.alertType === occurrence.alertType;
}

export function routingFeedbackInfluence(
  rows: FeedbackRow[],
  occurrence: Occurrence,
  userId: number,
  enabled = true,
  now = new Date(),
) {
  const relevant = rows
    .filter((row) => row.userId === userId && matchesContext(row, occurrence))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (!enabled || !relevant.length) {
    return {
      adjustment: 0,
      positive: relevant.filter((row) => row.feedback === "positive").length,
      negative: relevant.filter((row) => row.feedback === "negative").length,
      recentHardNegative: false,
      explanation: null as string | null,
    };
  }

  let adjustment = 0;
  let latestPositiveAt = 0;
  let latestHardNegativeAt = 0;
  let positive = 0;
  let negative = 0;

  for (const row of relevant) {
    const reason = (routingFeedbackReasons as readonly string[]).includes(row.reasonCode)
      ? row.reasonCode as RoutingFeedbackReason
      : "other";
    const days = ageDays(row.createdAt, now);
    const decay = decayFactor(days);
    const created = new Date(row.createdAt).getTime();

    if (row.feedback === "positive") {
      positive += 1;
      adjustment += positiveWeight[reason] * decay;
      latestPositiveAt = Math.max(latestPositiveAt, created);
    } else if (row.feedback === "negative") {
      negative += 1;
      adjustment += negativeWeight[reason] * decay;
      if ((reason === "competence" || reason === "context") && days <= 90) {
        latestHardNegativeAt = Math.max(latestHardNegativeAt, created);
      }
    }
  }

  adjustment = Number(Math.max(-1.2, Math.min(2, adjustment)).toFixed(2));
  const recentHardNegative = latestHardNegativeAt > 0 && latestHardNegativeAt > latestPositiveAt;
  const explanation = adjustment === 0
    ? `${positive} positivo(s) · ${negative} negativo(s), sem efeito líquido atual`
    : adjustment < 0
      ? `${positive} positivo(s) · ${negative} negativo(s), histórico favorece ${Math.abs(adjustment).toFixed(2)} ponto(s)`
      : `${positive} positivo(s) · ${negative} negativo(s), histórico desfavorece ${adjustment.toFixed(2)} ponto(s)`;

  return { adjustment, positive, negative, recentHardNegative, explanation };
}
