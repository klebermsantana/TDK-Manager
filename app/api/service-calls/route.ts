import { asc, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { getDb } from "@/db";
import {
  companies,
  serviceCallFiles,
  serviceCallHistory,
  serviceCalls,
  serviceCallServices,
} from "@/db/schema";

const statuses = new Set([
  "triagem",
  "aberto",
  "acionado",
  "confirmado",
  "deslocamento",
  "atendimento",
  "pendente",
  "concluido",
  "cancelado",
]);
const priorities = new Set(["baixa", "normal", "alta", "critica"]);
const transitions: Record<string, string[]> = {
  triagem: ["aberto", "cancelado"],
  aberto: ["triagem", "acionado", "cancelado"],
  acionado: ["aberto", "confirmado", "cancelado"],
  confirmado: ["acionado", "deslocamento", "cancelado"],
  deslocamento: ["confirmado", "atendimento", "pendente"],
  atendimento: ["pendente", "concluido"],
  pendente: [
    "acionado",
    "confirmado",
    "deslocamento",
    "atendimento",
    "concluido",
  ],
  concluido: [],
  cancelado: [],
};

export async function GET() {
  if (!(await getChatGPTUser()))
    return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const calls = await getDb()
      .select()
      .from(serviceCalls)
      .orderBy(desc(serviceCalls.createdAt));
    const history = await getDb()
      .select()
      .from(serviceCallHistory)
      .orderBy(asc(serviceCallHistory.createdAt));
    return Response.json({ calls, history });
  } catch {
    return Response.json(
      { error: "Não foi possível carregar os chamados." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requirePermission("sales");
  if (denied) return denied;
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const p = (await request.json()) as Record<string, unknown>;
    const companyId = Number(p.companyId),
      serviceTakerCompanyId = Number(p.serviceTakerCompanyId),
      locationCompanyId = Number(p.locationCompanyId),
      subject = String(p.subject ?? "").trim(),
      description = String(p.description ?? "").trim();
    const [company] = await getDb()
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    const [serviceTakerCompany] = serviceTakerCompanyId
      ? await getDb()
          .select()
          .from(companies)
          .where(eq(companies.id, serviceTakerCompanyId))
          .limit(1)
      : [];
    const [serviceLocationCompany] = locationCompanyId
      ? await getDb()
          .select()
          .from(companies)
          .where(eq(companies.id, locationCompanyId))
          .limit(1)
      : [];
    const priority = priorities.has(String(p.priority))
      ? String(p.priority)
      : "normal";
    if (
      !company ||
      !company.isClient ||
      (serviceTakerCompanyId &&
        (!serviceTakerCompany || !serviceTakerCompany.isServiceTaker)) ||
      (locationCompanyId &&
        (!serviceLocationCompany ||
          !serviceLocationCompany.isServiceLocation)) ||
      !subject ||
      !description
    )
      return Response.json(
        {
          error:
            "Selecione um cliente cadastrado e revise os dados do chamado.",
        },
        { status: 400 },
      );
    const requestedNumber = String(p.number ?? "").trim();
    const number = /^TDK-\d{6,10}$/.test(requestedNumber)
      ? requestedNumber
      : `TDK-${Date.now().toString().slice(-8)}`;
    const [call] = await getDb()
      .insert(serviceCalls)
      .values({
        number,
        companyId,
        serviceTakerCompanyId: serviceTakerCompanyId || null,
        companyName: company.name,
        serviceTaker: serviceTakerCompany?.name ?? null,
        requestOrigin: String(p.requestOrigin ?? "").trim() || null,
        department: String(p.department ?? "").trim() || null,
        customerTicket: String(p.customerTicket ?? "").trim() || null,
        saleId: Number(p.saleId) || null,
        locationId: null,
        locationCompanyId: locationCompanyId || null,
        location: serviceLocationCompany?.name ?? null,
        contactName: String(p.contactName ?? "").trim() || null,
        technician: String(p.technician ?? "").trim() || null,
        serviceType: String(p.serviceType ?? "visita"),
        priority,
        scheduledAt: p.scheduledAt ? String(p.scheduledAt) : null,
        status: "triagem",
        subject,
        description,
        createdBy: user.displayName,
      })
      .returning();
    await getDb().insert(serviceCallHistory).values({
      serviceCallId: call.id,
      fromStatus: null,
      toStatus: "triagem",
      changedBy: user.displayName,
    });
    return Response.json({ call }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Não foi possível cadastrar o chamado." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const denied = await requirePermission("sales");
  if (denied) return denied;
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const p = (await request.json()) as Record<string, unknown>,
      id = Number(p.id),
      status = String(p.status);
    if (!id || !statuses.has(status))
      return Response.json(
        { error: "Chamado ou status inválido." },
        { status: 400 },
      );
    const [current] = await getDb()
      .select()
      .from(serviceCalls)
      .where(eq(serviceCalls.id, id))
      .limit(1);
    if (!current)
      return Response.json(
        { error: "Chamado não encontrado." },
        { status: 404 },
      );
    if (
      status !== current.status &&
      !transitions[current.status]?.includes(status)
    )
      return Response.json(
        {
          error: `Não é permitido passar de ${current.status} diretamente para ${status}.`,
        },
        { status: 400 },
      );
    const values = {
      ...current,
      companyId: Number(p.companyId ?? current.companyId) || null,
      serviceTakerCompanyId:
        Number(p.serviceTakerCompanyId ?? current.serviceTakerCompanyId) ||
        null,
      companyName: String(p.companyName ?? current.companyName).trim(),
      serviceTaker:
        String(p.serviceTaker ?? current.serviceTaker ?? "").trim() || null,
      requestOrigin:
        String(p.requestOrigin ?? current.requestOrigin ?? "").trim() || null,
      department:
        String(p.department ?? current.department ?? "").trim() || null,
      customerTicket:
        String(p.customerTicket ?? current.customerTicket ?? "").trim() || null,
      saleId: Number(p.saleId ?? current.saleId) || null,
      location: String(p.location ?? current.location ?? "").trim() || null,
      locationId: Number(p.locationId ?? current.locationId) || null,
      locationCompanyId:
        Number(p.locationCompanyId ?? current.locationCompanyId) || null,
      contactName:
        String(p.contactName ?? current.contactName ?? "").trim() || null,
      technician:
        String(p.technician ?? current.technician ?? "").trim() || null,
      serviceType: String(p.serviceType ?? current.serviceType),
      priority: priorities.has(String(p.priority ?? current.priority))
        ? String(p.priority ?? current.priority)
        : current.priority,
      scheduledAt:
        "scheduledAt" in p
          ? String(p.scheduledAt ?? "").trim() || null
          : current.scheduledAt,
      subject: String(p.subject ?? current.subject).trim(),
      description: String(p.description ?? current.description).trim(),
      executedService:
        String(p.executedService ?? current.executedService ?? "").trim() ||
        null,
      consumablesUsed: Boolean(p.consumablesUsed ?? current.consumablesUsed),
      consumablesDescription:
        String(
          p.consumablesDescription ?? current.consumablesDescription ?? "",
        ).trim() || null,
      partsReplaced: Boolean(p.partsReplaced ?? current.partsReplaced),
      partsDescription:
        String(p.partsDescription ?? current.partsDescription ?? "").trim() ||
        null,
      expensesAmount: Math.max(
        0,
        Number(p.expensesAmount ?? current.expensesAmount) || 0,
      ),
      expensesDescription:
        String(
          p.expensesDescription ?? current.expensesDescription ?? "",
        ).trim() || null,
      status,
      updatedAt: new Date().toISOString(),
    };
    const [selectedCompany] = values.companyId
      ? await getDb()
          .select()
          .from(companies)
          .where(eq(companies.id, values.companyId))
          .limit(1)
      : [];
    const [selectedTaker] = values.serviceTakerCompanyId
      ? await getDb()
          .select()
          .from(companies)
          .where(eq(companies.id, values.serviceTakerCompanyId))
          .limit(1)
      : [];
    const [selectedLocationCompany] = values.locationCompanyId
      ? await getDb()
          .select()
          .from(companies)
          .where(eq(companies.id, values.locationCompanyId))
          .limit(1)
      : [];
    if (
      !selectedCompany ||
      !selectedCompany.isClient ||
      (values.serviceTakerCompanyId &&
        (!selectedTaker || !selectedTaker.isServiceTaker)) ||
      (values.locationCompanyId &&
        (!selectedLocationCompany ||
          !selectedLocationCompany.isServiceLocation))
    )
      return Response.json(
        {
          error:
            "Selecione tomador, cliente e local de atendimento cadastrados.",
        },
        { status: 400 },
      );
    values.companyName = selectedCompany.name;
    values.serviceTaker = selectedTaker?.name ?? null;
    values.location = selectedLocationCompany?.name ?? values.location;
    if (status !== "triagem" && status !== "cancelado") {
      const missing = [
        !values.serviceTaker && "tomador do serviço",
        !values.companyName && "cliente",
        !values.location && "localidade",
        !values.contactName && "contato",
        !values.customerTicket && "chamado interno",
        !values.serviceType && "modalidade",
        !values.subject && "serviço solicitado",
        !values.scheduledAt && "data e hora do agendamento",
      ].filter(Boolean);
      if (missing.length)
        return Response.json(
          { error: `Para abrir o chamado, informe: ${missing.join(", ")}.` },
          { status: 400 },
        );
    }
    if (
      [
        "confirmado",
        "deslocamento",
        "atendimento",
        "pendente",
        "concluido",
      ].includes(status) &&
      !values.technician
    )
      return Response.json(
        {
          error:
            "Defina o técnico responsável antes de confirmar o atendimento.",
        },
        { status: 400 },
      );
    if (status === "concluido") {
      const [service] = await getDb()
        .select({ id: serviceCallServices.id })
        .from(serviceCallServices)
        .where(eq(serviceCallServices.serviceCallId, id))
        .limit(1);
      if (!service)
        return Response.json(
          {
            error:
              "Adicione ao menos um serviço executado antes de concluir o atendimento.",
          },
          { status: 400 },
        );
    }
    if (status === "concluido") {
      const [evidence] = await getDb()
        .select({ id: serviceCallFiles.id })
        .from(serviceCallFiles)
        .where(eq(serviceCallFiles.serviceCallId, id))
        .limit(1);
      if (!evidence)
        return Response.json(
          {
            error:
              "Anexe ao menos uma foto de evidência antes de concluir o atendimento.",
          },
          { status: 400 },
        );
    }
    const { id: _id, createdAt: _createdAt, ...changes } = values;
    const [call] = await getDb()
      .update(serviceCalls)
      .set(changes)
      .where(eq(serviceCalls.id, id))
      .returning();
    if (current.status !== status)
      await getDb().insert(serviceCallHistory).values({
        serviceCallId: id,
        fromStatus: current.status,
        toStatus: status,
        changedBy: user.displayName,
      });
    return Response.json({ call });
  } catch {
    return Response.json(
      { error: "Não foi possível atualizar o chamado." },
      { status: 500 },
    );
  }
}
