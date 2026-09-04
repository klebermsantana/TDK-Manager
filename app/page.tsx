import { headers } from "next/headers";
import CrmDashboard from "./crm-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const h = await headers();
  const email = h.get("oai-authenticated-user-email") ?? "kleber@tdktelecomunicacoes.com.br";
  const encodedName = h.get("oai-authenticated-user-full-name");
  const name = encodedName && h.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8"
    ? decodeURIComponent(encodedName)
    : "Kleber Santana";
  return <CrmDashboard user={{ name, email }} />;
}
