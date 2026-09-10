import type { Metadata } from "next";
import "./globals.css";
import "./navigation-kanban-fixes.css";
import "./equipment-scanner.css";
import "./service-call-flow.css";
import "./service-call-timeline.css";
import "./service-call-sla-dashboard.css";
import "./service-call-sla-policies.css";
import "./service-call-sla-config-shortcut.css";
import { ManagerUiPolicies } from "./manager-ui-policies";
import { ServiceCallKanbanEnhancer } from "./service-call-kanban-enhancer";
import { ServiceCallTimelineEnhancer } from "./service-call-timeline-enhancer";
import { ServiceCallSlaDashboardV2 } from "./service-call-sla-dashboard-v2";
import { ServiceCallSlaConfigShortcut } from "./service-call-sla-config-shortcut";

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
        <ServiceCallSlaDashboardV2 />
        <ServiceCallSlaConfigShortcut />
        {children}
      </body>
    </html>
  );
}
