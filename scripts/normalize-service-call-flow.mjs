import { readFile, unlink, writeFile } from "node:fs/promises";

const dashboardPath = new URL("../app/crm-dashboard.tsx", import.meta.url);
let dashboard = await readFile(dashboardPath, "utf8");
const originalDashboard = dashboard;

const replaceDashboard = (from, to) => {
  if (dashboard.includes(from)) dashboard = dashboard.replaceAll(from, to);
};

// Novos chamados sempre começam em Aberto e o histórico local acompanha o backend.
replaceDashboard(
  'status: current?.status ?? "triagem",',
  'status: current?.status ?? "aberto",',
);
replaceDashboard('toStatus: "triagem",', 'toStatus: "aberto",');
replaceDashboard(
  'number: `TDK-${Date.now().toString().slice(-8)}`,',
  'number: "",',
);

// Textos legados de Triagem.
replaceDashboard(
  '"Faça a triagem, distribua e acompanhe os atendimentos técnicos."',
  '"Receba, distribua e acompanhe os atendimentos técnicos desde a abertura."',
);
replaceDashboard(
  ': "Registre inicialmente a ocorrência para triagem."',
  ': "Registre a ocorrência. O chamado será criado diretamente como Aberto, mesmo com informações operacionais pendentes."',
);
replaceDashboard(
  '{editingId ? "Salvar informações" : "Cadastrar em triagem"}',
  '{editingId ? "Salvar informações" : "Cadastrar chamado"}',
);
replaceDashboard(
  '{serviceCallForm.number}',
  '{editingId ? serviceCallForm.number : "Número gerado automaticamente ao salvar"}',
);
replaceDashboard(
  '!["triagem", "cancelado"].includes(status.id)',
  'status.id !== "cancelado"',
);

// A lista de status passa a ter uma única definição oficial, sem Triagem.
dashboard = dashboard.replace(
  /const serviceCallStatuses = \[[\s\S]*?\];\nconst executionServiceCallStatuses/,
  `const serviceCallStatuses = [\n  { id: "aberto", label: "Aberto" },\n  { id: "acionado", label: "Acionado" },\n  { id: "confirmado", label: "Confirmado" },\n  { id: "deslocamento", label: "Deslocamento" },\n  { id: "atendimento", label: "Em atendimento" },\n  { id: "pendente", label: "Pendente" },\n  { id: "concluido", label: "Concluído" },\n  { id: "cancelado", label: "Cancelado" },\n];\nconst executionServiceCallStatuses`,
);

// O campo Código do catálogo é somente leitura: quem gera é a API PS-0001, PS-0002...
dashboard = dashboard.replace(
  /<Field label="Código">\s*<Input\s*value=\{catalogForm\.code\}[\s\S]*?placeholder="Ex\.: MAT-001"\s*\/>\s*<\/Field>/,
  `<Field label="Código">\n                <Input\n                  value={catalogForm.code}\n                  disabled\n                  readOnly\n                  placeholder="Gerado automaticamente · PS-0001, PS-0002..."\n                  title="Código gerado automaticamente pelo TDK Manager"\n                />\n              </Field>`,
);

// O campo Código de equipamentos/peças é somente leitura: quem gera é a API EQ-0001, EQ-0002...
dashboard = dashboard.replace(
  /<Field label="Código"><Input value=\{equipmentForm\.code\} onChange=\{\(e\) => setEquipmentForm\(\{\.\.\.equipmentForm, code:e\.target\.value\}\)\} placeholder="Ex\.: EQP-001" \/><\/Field>/,
  `<Field label="Código"><Input value={equipmentForm.code} disabled readOnly placeholder="Gerado automaticamente · EQ-0001, EQ-0002..." title="Código gerado automaticamente pelo TDK Manager" /></Field>`,
);

// Toda entrada em Pendente — botão, seletor ou Kanban — dispara a mesma janela de motivo.
const statusFunctionStart = `  async function changeServiceCallStatus(call: ServiceCall, status: string) {\n    if (call.status === status) return;`;
const statusFunctionWithPending = `  async function changeServiceCallStatus(call: ServiceCall, status: string) {\n    if (call.status === status) return;\n    if (status === "pendente") {\n      window.dispatchEvent(\n        new CustomEvent("tdk:service-call-pending", {\n          detail: {\n            callId: call.id,\n            callNumber: serviceCallNumber(call.number),\n          },\n        }),\n      );\n      return;\n    }`;
if (
  dashboard.includes(statusFunctionStart) &&
  !dashboard.includes('new CustomEvent("tdk:service-call-pending"')
) {
  dashboard = dashboard.replace(statusFunctionStart, statusFunctionWithPending);
}

// Texto operacional exibido no formulário.
dashboard = dashboard.replace(
  /<small className="service-call-rule-note">[\s\S]*?<\/small>/,
  `<small className="service-call-rule-note">\n              Chamados novos começam em Aberto. Para Acionar, complete tomador, local, contato, chamado interno e modalidade, além de definir o técnico. O agendamento passa a ser obrigatório ao Confirmar o atendimento. Ao marcar Pendente, informe obrigatoriamente o motivo da pendência. O departamento é opcional.\n            </small>`,
);

const forbidden = [
  '{ id: "triagem", label: "Triagem" }',
  'current?.status ?? "triagem"',
  'toStatus: "triagem"',
  'Cadastrar em triagem',
  'Registre inicialmente a ocorrência para triagem',
];
for (const fragment of forbidden) {
  if (dashboard.includes(fragment)) {
    throw new Error(`Fluxo legado ainda presente após normalização: ${fragment}`);
  }
}
if (!dashboard.includes('placeholder="Gerado automaticamente · PS-0001, PS-0002..."')) {
  throw new Error("Campo automático PS não foi aplicado no dashboard.");
}
if (!dashboard.includes('placeholder="Gerado automaticamente · EQ-0001, EQ-0002..."')) {
  throw new Error("Campo automático EQ não foi aplicado no dashboard.");
}
if (!dashboard.includes('new CustomEvent("tdk:service-call-pending"')) {
  throw new Error("A solicitação de motivo para o status Pendente não foi aplicada.");
}
if (dashboard !== originalDashboard) {
  await writeFile(dashboardPath, dashboard);
}

// Unifica a janela de Pendência dentro do ManagerUiPolicies.
const policiesPath = new URL("../app/manager-ui-policies.tsx", import.meta.url);
let policies = await readFile(policiesPath, "utf8");
const originalPolicies = policies;
if (!policies.includes('window.addEventListener("tdk:service-call-pending"')) {
  const hook = `    applyPolicies();\n    const observer = new MutationObserver(schedulePolicies);`;
  const handler = `    const handlePendingRequest = (event: Event) => {\n      const detail = (event as CustomEvent<{ callId?: number; callNumber?: string }>).detail;\n      const call = detail?.callId\n        ? calls.find((item) => item.id === detail.callId)\n        : undefined;\n      const callNumber =\n        detail?.callNumber ??\n        (call ? displayServiceCallNumber(call.number) : "");\n      if (!callNumber) return;\n      setPendingReason("");\n      setPendingNotes("");\n      setPendingError("");\n      setPendingDialog({ callNumber, editing: false });\n    };\n\n    applyPolicies();\n    const observer = new MutationObserver(schedulePolicies);`;
  if (!policies.includes(hook))
    throw new Error("Não foi possível localizar o ponto de integração da janela de Pendência.");
  policies = policies.replace(hook, handler);
  policies = policies.replace(
    `    document.addEventListener("change", schedulePolicies, true);\n    document.addEventListener("click", handleClick, true);`,
    `    document.addEventListener("change", schedulePolicies, true);\n    window.addEventListener("tdk:service-call-pending", handlePendingRequest);\n    document.addEventListener("click", handleClick, true);`,
  );
  policies = policies.replace(
    `      document.removeEventListener("change", schedulePolicies, true);\n      document.removeEventListener("click", handleClick, true);`,
    `      document.removeEventListener("change", schedulePolicies, true);\n      window.removeEventListener("tdk:service-call-pending", handlePendingRequest);\n      document.removeEventListener("click", handleClick, true);`,
  );
}
if (!policies.includes('window.addEventListener("tdk:service-call-pending"')) {
  throw new Error("ManagerUiPolicies não passou a escutar o fluxo de Pendência.");
}
if (policies !== originalPolicies) await writeFile(policiesPath, policies);

// Remove o bridge duplicado: agora existe uma única janela de Pendência.
const layoutPath = new URL("../app/layout.tsx", import.meta.url);
let layout = await readFile(layoutPath, "utf8");
const originalLayout = layout;
layout = layout
  .replace('import { ServiceCallPendingBridge } from "./service-call-pending-bridge";\n', "")
  .replace('        <ServiceCallPendingBridge />\n', "");
if (layout !== originalLayout) await writeFile(layoutPath, layout);
try {
  await unlink(new URL("../app/service-call-pending-bridge.tsx", import.meta.url));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

// O schema também passa a refletir o fluxo aprovado e registra Pendências formalmente.
const schemaPath = new URL("../db/schema.ts", import.meta.url);
let schema = await readFile(schemaPath, "utf8");
const originalSchema = schema;
schema = schema.replace(
  'status: text("status").notNull().default("triagem"),',
  'status: text("status").notNull().default("aberto"),',
);
if (!schema.includes("export const serviceCallPendencies = sqliteTable(")) {
  const marker = `export const serviceCallFiles = sqliteTable(`;
  const table = `export const serviceCallPendencies = sqliteTable(\n  "service_call_pendencies",\n  {\n    id: integer("id").primaryKey({ autoIncrement: true }),\n    serviceCallId: integer("service_call_id")\n      .notNull()\n      .references(() => serviceCalls.id),\n    reason: text("reason").notNull(),\n    notes: text("notes"),\n    startedAt: text("started_at").notNull(),\n    endedAt: text("ended_at"),\n    startedBy: text("started_by").notNull(),\n    endedBy: text("ended_by"),\n  },\n  (table) => [\n    index("idx_service_call_pendencies_call").on(table.serviceCallId),\n    index("idx_service_call_pendencies_open").on(\n      table.serviceCallId,\n      table.endedAt,\n    ),\n  ],\n);\n`;
  if (!schema.includes(marker))
    throw new Error("Não foi possível localizar o ponto para inserir serviceCallPendencies.");
  schema = schema.replace(marker, `${table}${marker}`);
}
if (schema.includes('status: text("status").notNull().default("triagem")')) {
  throw new Error("O schema ainda define Triagem como status padrão.");
}
if (!schema.includes("export const serviceCallPendencies = sqliteTable(")) {
  throw new Error("Tabela de Pendências não foi formalizada no schema.");
}
if (schema !== originalSchema) await writeFile(schemaPath, schema);

console.log(
  "Fluxo operacional normalizado: Aberto como padrão, códigos automáticos, Pendência unificada e schema formalizado.",
);
