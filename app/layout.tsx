import type { Metadata } from "next";
import "./globals.css";
import "./navigation-kanban-fixes.css";
import "./equipment-scanner.css";
import "./service-call-flow.css";
import { ManagerUiPolicies } from "./manager-ui-policies";
import { ServiceCallPendingBridge } from "./service-call-pending-bridge";

export const metadata: Metadata = {
  title: "TDK Manager | Gestão comercial",
  description: "CRM e plataforma de gestão empresarial da TDK.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <ManagerUiPolicies />
        <ServiceCallPendingBridge />
        {children}
      </body>
    </html>
  );
}
