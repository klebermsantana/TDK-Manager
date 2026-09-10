import type { Metadata } from "next";
import "./globals.css";
import "./navigation-kanban-fixes.css";
import "./equipment-scanner.css";
import "./service-call-flow.css";
import "./service-call-timeline.css";
import "./service-call-sla-dashboard.css";
import { ManagerUiPolicies } from "./manager-ui-policies";
import { ServiceCallKanbanEnhancer } from "./service-call-kanban-enhancer";
import { ServiceCallTimelineEnhancer } from "./service-call-timeline-enhancer";
import { ServiceCallSlaDashboard } from "./service-call-sla-dashboard";

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
        <ServiceCallKanbanEnhancer />
        <ServiceCallTimelineEnhancer />
        <ServiceCallSlaDashboard />
        {children}
      </body>
    </html>
  );
}
