import { asc, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { getDb } from "@/db";
import { serviceCallHistory, serviceCalls } from "@/db/schema";

const statuses=new Set(["triagem","aberto","acionado","confirmado","deslocamento","atendimento","pendente","concluido","cancelado"]);
const priorities=new Set(["baixa","normal","alta","critica"]);

export async function GET(){
  if(!await getChatGPTUser())return Response.json({error:"Sessão não autenticada."},{status:401});
  try{
    const calls=await getDb().select().from(serviceCalls).orderBy(desc(serviceCalls.createdAt));
    const history=await getDb().select().from(serviceCallHistory).orderBy(asc(serviceCallHistory.createdAt));
    return Response.json({calls,history});
  }catch{return Response.json({error:"Não foi possível carregar os chamados."},{status:503});}
}

export async function POST(request:Request){
  const denied=await requirePermission("sales");if(denied)return denied;
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Sessão não autenticada."},{status:401});
  try{
    const p=await request.json() as Record<string,unknown>;
    const companyName=String(p.companyName??"").trim(),subject=String(p.subject??"").trim(),description=String(p.description??"").trim();
    const priority=priorities.has(String(p.priority))?String(p.priority):"normal";
    if(!companyName||!subject||!description)return Response.json({error:"Informe cliente, assunto e descrição do chamado."},{status:400});
    const number=`OS-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const [call]=await getDb().insert(serviceCalls).values({number,companyId:Number(p.companyId)||null,companyName,saleId:Number(p.saleId)||null,location:String(p.location??"").trim()||null,contactName:String(p.contactName??"").trim()||null,technician:String(p.technician??"").trim()||null,serviceType:String(p.serviceType??"visita"),priority,scheduledAt:p.scheduledAt?String(p.scheduledAt):null,status:"triagem",subject,description,createdBy:user.displayName}).returning();
    await getDb().insert(serviceCallHistory).values({serviceCallId:call.id,fromStatus:null,toStatus:"triagem",changedBy:user.displayName});
    return Response.json({call},{status:201});
  }catch{return Response.json({error:"Não foi possível cadastrar o chamado."},{status:500});}
}

export async function PATCH(request:Request){
  const denied=await requirePermission("sales");if(denied)return denied;
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Sessão não autenticada."},{status:401});
  try{
    const p=await request.json() as Record<string,unknown>,id=Number(p.id),status=String(p.status);
    if(!id||!statuses.has(status))return Response.json({error:"Chamado ou status inválido."},{status:400});
    const [current]=await getDb().select().from(serviceCalls).where(eq(serviceCalls.id,id)).limit(1);
    if(!current)return Response.json({error:"Chamado não encontrado."},{status:404});
    const [call]=await getDb().update(serviceCalls).set({status,updatedAt:new Date().toISOString()}).where(eq(serviceCalls.id,id)).returning();
    if(current.status!==status)await getDb().insert(serviceCallHistory).values({serviceCallId:id,fromStatus:current.status,toStatus:status,changedBy:user.displayName});
    return Response.json({call});
  }catch{return Response.json({error:"Não foi possível atualizar o chamado."},{status:500});}
}
