import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { getDb } from "@/db";
import { projectTasks, sales } from "@/db/schema";

async function recalculate(saleId:number){
  const tasks=await getDb().select().from(projectTasks).where(eq(projectTasks.saleId,saleId));
  const progress=tasks.length?Math.round(tasks.filter(task=>task.completedAt).length/tasks.length*100):0;
  const [sale]=await getDb().select().from(sales).where(eq(sales.id,saleId)).limit(1);
  if(sale){const projectStatus=progress===100?"concluido":progress>0?"andamento":sale.projectStatus==="cancelado"?"cancelado":"aguardando";await getDb().update(sales).set({progress,projectStatus,updatedAt:new Date().toISOString()}).where(eq(sales.id,saleId));}
  return progress;
}
export async function GET(){if(!await getChatGPTUser())return Response.json({error:"Sessão não autenticada."},{status:401});try{return Response.json({tasks:await getDb().select().from(projectTasks).orderBy(asc(projectTasks.dueDate),asc(projectTasks.id))});}catch{return Response.json({error:"Não foi possível carregar as tarefas dos projetos."},{status:503});}}
export async function POST(request:Request){const denied=await requirePermission("sales");if(denied)return denied;try{const p=await request.json() as Record<string,unknown>,saleId=Number(p.saleId),title=String(p.title??"").trim();if(!saleId||!title)return Response.json({error:"Informe a tarefa do projeto."},{status:400});const [task]=await getDb().insert(projectTasks).values({saleId,title,responsible:String(p.responsible??"").trim()||null,dueDate:p.dueDate?String(p.dueDate):null}).returning();const progress=await recalculate(saleId);return Response.json({task,progress},{status:201});}catch{return Response.json({error:"Não foi possível cadastrar a tarefa."},{status:500});}}
export async function PATCH(request:Request){const denied=await requirePermission("sales");if(denied)return denied;try{const p=await request.json() as Record<string,unknown>,id=Number(p.id);const [current]=await getDb().select().from(projectTasks).where(eq(projectTasks.id,id)).limit(1);if(!current)return Response.json({error:"Tarefa não encontrada."},{status:404});const [task]=await getDb().update(projectTasks).set({completedAt:p.completed?new Date().toISOString():null,updatedAt:new Date().toISOString()}).where(eq(projectTasks.id,id)).returning();const progress=await recalculate(current.saleId);return Response.json({task,progress});}catch{return Response.json({error:"Não foi possível atualizar a tarefa."},{status:500});}}
export async function DELETE(request:Request){const denied=await requirePermission("sales");if(denied)return denied;try{const id=Number(new URL(request.url).searchParams.get("id"));const [current]=await getDb().select().from(projectTasks).where(eq(projectTasks.id,id)).limit(1);if(!current)return Response.json({error:"Tarefa não encontrada."},{status:404});await getDb().delete(projectTasks).where(eq(projectTasks.id,id));const progress=await recalculate(current.saleId);return Response.json({ok:true,progress,saleId:current.saleId});}catch{return Response.json({error:"Não foi possível excluir a tarefa."},{status:500});}}
