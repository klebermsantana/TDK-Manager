import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureServiceFieldExecutionTables } from "@/app/service-field-execution-runtime";
import { getDb } from "@/db";
import { serviceCallExpenses, serviceCalls, users } from "@/db/schema";
import { serviceCallTechnicians, serviceTechnicianAudit, serviceTechnicians } from "@/db/service-technician-schema";
import { serviceFieldEvidences, serviceFieldEvents, serviceFieldExecutions, serviceFieldExpenseLinks } from "@/db/service-field-execution-schema";

const clean = (value: unknown) => String(value ?? "").trim();
const transitions: Record<string, string[]> = { assigned:["invited"], invited:["accepted","declined"], accepted:["en_route"], en_route:["arrived"], arrived:["checked_in"], checked_in:["in_progress"], in_progress:["finished","return_required"], return_required:["accepted"], finished:["checked_out"], checked_out:["closed"] };
const columns: Record<string,string> = { invited:"invitedAt",accepted:"acceptedAt",declined:"declinedAt",en_route:"departedAt",arrived:"arrivedAt",checked_in:"checkedInAt",in_progress:"startedAt",finished:"finishedAt",checked_out:"checkedOutAt",closed:"closedAt" };

async function actor() {
  const auth = await getChatGPTUser(); if (!auth) return null;
  const db = getDb(); const [allUsers, technicians] = await Promise.all([db.select().from(users),db.select().from(serviceTechnicians)]);
  const user = allUsers.find((row) => row.email.toLowerCase() === auth.email.toLowerCase());
  const technician = technicians.find((row) => row.active && ((user && row.userId === user.id) || row.email?.toLowerCase() === auth.email.toLowerCase()));
  return technician ? { auth, technician } : null;
}

async function payload(technicianId:number) {
  const db=getDb(); const [assignments,calls,executions,events,evidences,links,expenses]=await Promise.all([
    db.select().from(serviceCallTechnicians).where(eq(serviceCallTechnicians.technicianId,technicianId)),db.select().from(serviceCalls),db.select().from(serviceFieldExecutions).where(eq(serviceFieldExecutions.technicianId,technicianId)),db.select().from(serviceFieldEvents).where(eq(serviceFieldEvents.technicianId,technicianId)),db.select().from(serviceFieldEvidences),db.select().from(serviceFieldExpenseLinks),db.select().from(serviceCallExpenses)
  ]);
  const active=assignments.filter(a=>a.assignmentStatus!=="cancelled");
  for(const assignment of active){if(!executions.some(e=>e.assignmentId===assignment.id)){const [created]=await db.insert(serviceFieldExecutions).values({assignmentId:assignment.id,serviceCallId:assignment.serviceCallId,technicianId}).returning();executions.push(created)}}
  const callById=new Map(calls.map(c=>[c.id,c])),linkByExpense=new Map(links.map(l=>[l.expenseId,l.executionId]));
  return { technician: (await db.select().from(serviceTechnicians).where(eq(serviceTechnicians.id,technicianId)).limit(1))[0], jobs:active.map(a=>{const call=callById.get(a.serviceCallId),execution=executions.find(e=>e.assignmentId===a.id)!;return {assignmentId:a.id,role:a.role,call:call?{id:call.id,number:call.number,companyName:call.companyName,location:call.location,contactName:call.contactName,serviceType:call.serviceType,priority:call.priority,scheduledAt:call.scheduledAt,status:call.status,subject:call.subject,description:call.description}:null,execution:{...execution,events:events.filter(e=>e.executionId===execution.id).sort((x,y)=>x.occurredAt.localeCompare(y.occurredAt)),evidences:evidences.filter(e=>e.executionId===execution.id),expenses:expenses.filter(e=>linkByExpense.get(e.id)===execution.id)}}}).filter(j=>j.call).sort((a,b)=>(a.call?.scheduledAt??"9999").localeCompare(b.call?.scheduledAt??"9999")) };
}

export async function GET(){try{await ensureServiceFieldExecutionTables();const current=await actor();if(!current)return Response.json({error:"Seu usuário não está vinculado a um técnico ativo."},{status:403});return Response.json(await payload(current.technician.id))}catch(error){return Response.json({error:error instanceof Error?error.message:"Falha ao carregar atendimentos."},{status:503})}}

export async function POST(request:Request){
 try{await ensureServiceFieldExecutionTables();const current=await actor();if(!current)return Response.json({error:"Acesso técnico não autorizado."},{status:403});const body=await request.json() as Record<string,unknown>,db=getDb(),executionId=Number(body.executionId);const [execution]=await db.select().from(serviceFieldExecutions).where(eq(serviceFieldExecutions.id,executionId)).limit(1);if(!execution||execution.technicianId!==current.technician.id)return Response.json({error:"Atendimento não encontrado."},{status:404});const action=clean(body.action),now=new Date().toISOString();
  if(action==="transition"){const status=clean(body.status);if(!(transitions[execution.status]??[]).includes(status))return Response.json({error:"Esta etapa não pode ser registrada agora."},{status:409});const note=clean(body.note);if(["declined","return_required"].includes(status)&&!note)return Response.json({error:"Informe o motivo."},{status:400});const changes:Record<string,unknown>={status,updatedAt:now};if(columns[status])changes[columns[status]]=now;if(status==="accepted"&&clean(body.expectedArrivalAt))changes.expectedArrivalAt=new Date(clean(body.expectedArrivalAt)).toISOString();if(status==="declined")changes.declineReason=note;if(status==="return_required")changes.returnReason=note;if(status==="finished")changes.technicianReport=note||null;const lat=Number(body.latitude),lng=Number(body.longitude);if(status==="checked_in"&&Number.isFinite(lat)&&Number.isFinite(lng)){changes.checkInLatitude=lat;changes.checkInLongitude=lng}if(status==="checked_out"&&Number.isFinite(lat)&&Number.isFinite(lng)){changes.checkOutLatitude=lat;changes.checkOutLongitude=lng}await db.update(serviceFieldExecutions).set(changes).where(eq(serviceFieldExecutions.id,execution.id));await db.insert(serviceFieldEvents).values({executionId,serviceCallId:execution.serviceCallId,technicianId:execution.technicianId,eventType:status,occurredAt:now,latitude:Number.isFinite(lat)?lat:null,longitude:Number.isFinite(lng)?lng:null,note:note||null,performedBy:current.auth.email});await db.update(serviceCallTechnicians).set({assignmentStatus:status==="accepted"?"accepted":status==="declined"?"declined":["closed"].includes(status)?status:"in_progress",updatedAt:now}).where(eq(serviceCallTechnicians.id,execution.assignmentId));await db.insert(serviceTechnicianAudit).values({technicianId:execution.technicianId,assignmentId:execution.assignmentId,serviceCallId:execution.serviceCallId,action:`technician_${status}`,performedBy:current.auth.email,note:note||null});}
  else if(action==="evidence"){if(!clean(body.title))return Response.json({error:"Informe o título da evidência."},{status:400});await db.insert(serviceFieldEvidences).values({executionId,serviceCallId:execution.serviceCallId,evidenceType:clean(body.evidenceType)||"photo",title:clean(body.title),description:clean(body.description)||null,url:clean(body.url)||null,capturedAt:now,uploadedBy:current.auth.email});}
  else if(action==="expense"){const amount=Number(body.amount);if(!clean(body.description)||!Number.isFinite(amount)||amount<=0)return Response.json({error:"Informe descrição e valor válido."},{status:400});const [expense]=await db.insert(serviceCallExpenses).values({serviceCallId:execution.serviceCallId,category:clean(body.category)||"outros",description:clean(body.description),amount,expenseDate:now.slice(0,10)}).returning();await db.insert(serviceFieldExpenseLinks).values({executionId,expenseId:expense.id});}
  else return Response.json({error:"Ação inválida."},{status:400});return Response.json(await payload(current.technician.id));
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Falha ao atualizar atendimento."},{status:500})}
}
