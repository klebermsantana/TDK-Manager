import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../app/crm-dashboard.tsx", import.meta.url);
let source = await readFile(path, "utf8");

const replacements = [
  [
    'status: current?.status ?? "triagem",',
    'status: current?.status ?? "aberto",',
  ],
  [
    'toStatus: "triagem",',
    'toStatus: "aberto",',
  ],
  [
    '"Faça a triagem, distribua e acompanhe os atendimentos técnicos."',
    '"Receba, distribua e acompanhe os atendimentos técnicos desde a abertura."',
  ],
  [
    ': "Registre inicialmente a ocorrência para triagem."',
    ': "Registre a ocorrência. O chamado será criado diretamente como Aberto, mesmo com informações operacionais pendentes."',
  ],
  [
    '{editingId ? "Salvar informações" : "Cadastrar em triagem"}',
    '{editingId ? "Salvar informações" : "Cadastrar chamado"}',
  ],
  [
    '  { id: "triagem", label: "Triagem" },\n',
    '',
  ],
  [
    '!["triagem", "cancelado"].includes(status.id)',
    'status.id !== "cancelado"',
  ],
];

for (const [from, to] of replacements) {
  if (source.includes(from)) source = source.replaceAll(from, to);
}

source = source.replace(
  /<small className="service-call-rule-note">[\s\S]*?<\/small>/,
  `<small className="service-call-rule-note">\n              Chamados novos começam em Aberto. Para Acionar, complete tomador, local, contato, chamado interno e modalidade, além de definir o técnico. O agendamento passa a ser obrigatório ao Confirmar o atendimento. O departamento é opcional.\n            </small>`,
);

if (source.includes('{ id: "triagem", label: "Triagem" }')) {
  throw new Error("Triagem ainda está presente em serviceCallStatuses após a normalização.");
}
if (source.includes('current?.status ?? "triagem"')) {
  throw new Error("Novo chamado ainda possui status inicial Triagem.");
}
if (source.includes('Cadastrar em triagem')) {
  throw new Error("Texto legado 'Cadastrar em triagem' ainda está presente.");
}

await writeFile(path, source);
console.log("Fluxo de chamados normalizado: novos chamados iniciam em Aberto e Triagem foi removida da interface.");
