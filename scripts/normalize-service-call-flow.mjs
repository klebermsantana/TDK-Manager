import { readFile, writeFile } from "node:fs/promises";

// Esta rotina mantém o crm-dashboard.tsx alinhado ao fluxo operacional aprovado.
const path = new URL("../app/crm-dashboard.tsx", import.meta.url);
let source = await readFile(path, "utf8");
const original = source;

const replaceAll = (from, to) => {
  if (source.includes(from)) source = source.replaceAll(from, to);
};

// Novos chamados sempre começam em Aberto e o histórico local acompanha o backend.
replaceAll(
  'status: current?.status ?? "triagem",',
  'status: current?.status ?? "aberto",',
);
replaceAll('toStatus: "triagem",', 'toStatus: "aberto",');
replaceAll(
  'number: `TDK-${Date.now().toString().slice(-8)}`,',
  'number: "",',
);

// Textos legados de Triagem.
replaceAll(
  '"Faça a triagem, distribua e acompanhe os atendimentos técnicos."',
  '"Receba, distribua e acompanhe os atendimentos técnicos desde a abertura."',
);
replaceAll(
  ': "Registre inicialmente a ocorrência para triagem."',
  ': "Registre a ocorrência. O chamado será criado diretamente como Aberto, mesmo com informações operacionais pendentes."',
);
replaceAll(
  '{editingId ? "Salvar informações" : "Cadastrar em triagem"}',
  '{editingId ? "Salvar informações" : "Cadastrar chamado"}',
);
replaceAll(
  '{serviceCallForm.number}',
  '{editingId ? serviceCallForm.number : "Número gerado automaticamente ao salvar"}',
);
replaceAll(
  '!["triagem", "cancelado"].includes(status.id)',
  'status.id !== "cancelado"',
);

// A lista de status passa a ter uma única definição oficial, sem Triagem.
source = source.replace(
  /const serviceCallStatuses = \[[\s\S]*?\];\nconst executionServiceCallStatuses/,
  `const serviceCallStatuses = [\n  { id: "aberto", label: "Aberto" },\n  { id: "acionado", label: "Acionado" },\n  { id: "confirmado", label: "Confirmado" },\n  { id: "deslocamento", label: "Deslocamento" },\n  { id: "atendimento", label: "Em atendimento" },\n  { id: "pendente", label: "Pendente" },\n  { id: "concluido", label: "Concluído" },\n  { id: "cancelado", label: "Cancelado" },\n];\nconst executionServiceCallStatuses`,
);

// O campo Código do catálogo é somente leitura: quem gera é a API PS-0001, PS-0002...
source = source.replace(
  /<Field label="Código">\s*<Input\s*value=\{catalogForm\.code\}[\s\S]*?placeholder="Ex\.: MAT-001"\s*\/>\s*<\/Field>/,
  `<Field label="Código">\n                <Input\n                  value={catalogForm.code}\n                  disabled\n                  readOnly\n                  placeholder="Gerado automaticamente · PS-0001, PS-0002..."\n                  title="Código gerado automaticamente pelo TDK Manager"\n                />\n              </Field>`,
);

// O campo Código de equipamentos/peças é somente leitura: quem gera é a API EQ-0001, EQ-0002...
source = source.replace(
  /<Field label="Código"><Input value=\{equipmentForm\.code\} onChange=\{\(e\) => setEquipmentForm\(\{\.\.\.equipmentForm, code:e\.target\.value\}\)\} placeholder="Ex\.: EQP-001" \/><\/Field>/,
  `<Field label="Código"><Input value={equipmentForm.code} disabled readOnly placeholder="Gerado automaticamente · EQ-0001, EQ-0002..." title="Código gerado automaticamente pelo TDK Manager" /></Field>`,
);

// Toda entrada em Pendente abre a janela de motivo antes de efetivar a mudança.
const statusFunctionStart = `  async function changeServiceCallStatus(call: ServiceCall, status: string) {\n    if (call.status === status) return;`;
const statusFunctionWithPending = `  async function changeServiceCallStatus(call: ServiceCall, status: string) {\n    if (call.status === status) return;\n    if (status === "pendente") {\n      window.dispatchEvent(\n        new CustomEvent("tdk:service-call-pending", {\n          detail: {\n            callId: call.id,\n            callNumber: serviceCallNumber(call.number),\n          },\n        }),\n      );\n      return;\n    }`;
if (
  source.includes(statusFunctionStart) &&
  !source.includes('new CustomEvent("tdk:service-call-pending"')
) {
  source = source.replace(statusFunctionStart, statusFunctionWithPending);
}

// Texto operacional exibido no formulário.
source = source.replace(
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
  if (source.includes(fragment)) {
    throw new Error(`Fluxo legado ainda presente após normalização: ${fragment}`);
  }
}

if (!source.includes('placeholder="Gerado automaticamente · PS-0001, PS-0002..."')) {
  throw new Error("Campo automático PS não foi aplicado no dashboard.");
}
if (!source.includes('placeholder="Gerado automaticamente · EQ-0001, EQ-0002..."')) {
  throw new Error("Campo automático EQ não foi aplicado no dashboard.");
}
if (!source.includes('new CustomEvent("tdk:service-call-pending"')) {
  throw new Error("A solicitação de motivo para o status Pendente não foi aplicada.");
}

if (source !== original) {
  await writeFile(path, source);
  console.log("Dashboard atualizado: códigos automáticos, fluxo sem Triagem e motivo obrigatório para Pendente.");
} else {
  console.log("Dashboard já está normalizado.");
}
