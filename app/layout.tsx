import type { Metadata } from "next";
import "./globals.css";
import "./navigation-kanban-fixes.css";
import "./equipment-scanner.css";
import "./service-call-flow.css";
import "./service-call-timeline.css";
import "./service-call-sla-dashboard.css";
import "./service-call-sla-policies.css";
import "./service-call-sla-stage.css";
import "./service-call-sla-config-shortcut.css";
import "./service-call-sla-operations-section.css";
import "./service-call-profitability-dashboard.css";
import "./service-call-profitability-plan.css";
import "./service-call-client-profitability-section.css";
import "./service-call-financial-goals-section.css";
import "./team-profitability-permission-manager.css";
import { ManagerUiPolicies } from "./manager-ui-policies";
import { ServiceCallKanbanEnhancer } from "./service-call-kanban-enhancer";
import { ServiceCallTimelineEnhancer } from "./service-call-timeline-enhancer";
import { ServiceCallSlaDashboardV3 } from "./service-call-sla-dashboard-v3";
import { ServiceCallSlaAlertEnhancer } from "./service-call-sla-alert-enhancer";
import { ServiceCallSlaConfigShortcut } from "./service-call-sla-config-shortcut";
import { ServiceCallSlaOperationsSection } from "./service-call-sla-operations-section";
import { ServiceCallProfitabilityDashboard } from "./service-call-profitability-dashboard";
import { ServiceCallClientProfitabilitySection } from "./service-call-client-profitability-section";
import { ServiceCallFinancialGoalsSection } from "./service-call-financial-goals-section";
import { TeamProfitabilityPermissionManager } from "./team-profitability-permission-manager";

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
        <ServiceCallSlaDashboardV3 />
        <ServiceCallSlaAlertEnhancer />
        <ServiceCallSlaConfigShortcut />
        <ServiceCallSlaOperationsSection />
        <ServiceCallProfitabilityDashboard />
        <ServiceCallClientProfitabilitySection />
        <ServiceCallFinancialGoalsSection />
        <TeamProfitabilityPermissionManager />
        {children}
      </body>
    </html>
  );
}
