import { eq } from "drizzle-orm";
import { ensureServiceTechnicianSettlementTables } from "@/app/service-technician-settlement-runtime";
import { getDb } from "@/db";
import { serviceCallTechnicians, serviceTechnicianAudit } from "@/db/service-technician-schema";
import {
  serviceTechnicianSettlementAudit,
  serviceTechnicianSettlementItems,
  serviceTechnicianSettlements,
} from "@/db/service-technician-settlement-schema";

export async function releaseServiceTechnicianPayable(payableId: number, performedBy: string) {
  await ensureServiceTechnicianSettlementTables();
  const db = getDb();
  const now = new Date().toISOString();

  const [settlement] = await db.select().from(serviceTechnicianSettlements)
    .where(eq(serviceTechnicianSettlements.payableId, payableId)).limit(1);
  if (settlement) {
    const items = await db.select().from(serviceTechnicianSettlementItems)
      .where(eq(serviceTechnicianSettlementItems.settlementId, settlement.id));
    const queries: any[] = [
      db.update(serviceTechnicianSettlements).set({
        status: "approved",
        payableId: null,
        updatedAt: now,
      }).where(eq(serviceTechnicianSettlements.id, settlement.id)),
      db.insert(serviceTechnicianSettlementAudit).values({
        settlementId: settlement.id,
        technicianId: settlement.technicianId,
        action: "payable_cancelled",
        performedBy,
        note: `Título financeiro #${payableId} cancelado. Fechamento liberado para nova geração.`,
      }),
    ];
    for (const item of items) {
      queries.push(
        db.update(serviceCallTechnicians).set({
          payableId: null,
          apportionmentStatus: "approved",
          updatedAt: now,
        }).where(eq(serviceCallTechnicians.id, item.assignmentId)),
      );
    }
    await db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
    return { kind: "settlement" as const, settlementId: settlement.id, releasedAssignments: items.length };
  }

  const assignments = (await db.select().from(serviceCallTechnicians)).filter((row) => row.payableId === payableId);
  if (assignments.length) {
    const queries: any[] = [];
    for (const assignment of assignments) {
      queries.push(
        db.update(serviceCallTechnicians).set({
          payableId: null,
          apportionmentStatus: "approved",
          updatedAt: now,
        }).where(eq(serviceCallTechnicians.id, assignment.id)),
        db.insert(serviceTechnicianAudit).values({
          technicianId: assignment.technicianId,
          assignmentId: assignment.id,
          serviceCallId: assignment.serviceCallId,
          action: "payable_cancelled",
          performedBy,
          note: `Título financeiro #${payableId} cancelado. Apuração liberada para nova geração.`,
        }),
      );
    }
    await db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
    return { kind: "assignment" as const, releasedAssignments: assignments.length };
  }

  return { kind: "none" as const, releasedAssignments: 0 };
}
