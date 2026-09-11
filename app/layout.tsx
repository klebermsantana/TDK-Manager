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
import "./service-technician-cost-dashboard.css";
import "./service-call-profitability-plan.css";
import "./service-call-client-profitability-section.css";
import "./service-call-financial-goals-section.css";
import "./service-call-financial-forecast-section.css";
import "./cash-forecast-dashboard.css";
import "./net-cash-flow-dashboard.css";
import "./treasury-executive-dashboard.css";
import "./treasury-executive-alerts.css";
import "./treasury-alert-responsibility.css";
import "./treasury-my-work-dashboard.css";
import "./treasury-productivity-dashboard.css";
import "./treasury-capacity-dashboard.css";
import "./treasury-routing-profiles-dashboard.css";
import "./treasury-routing-schedules-dashboard.css";
import "./treasury-capacity-forecast-dashboard.css";
import "./treasury-capacity-alerts-dashboard.css";
import "./treasury-capacity-smart-routing-dashboard.css";
import "./treasury-capacity-smart-routing-feedback.css";
import "./treasury-capacity-routing-effectiveness-dashboard.css";
import "./treasury-dashboard.css";
import "./treasury-reconciliation-dashboard.css";
import "./treasury-reconciliation-split-dashboard.css";
import "./treasury-reconciliation-smart-suggestions.css";
import "./financial-ledger-dashboard.css";
import "./treasury-closing-dashboard.css";
import "./treasury-official-closing-dashboard.css";
import "./treasury-closing-calendar.css";
import "./treasury-closing-tasks-dashboard.css";
import "./team-profitability-permission-manager.css";
import { ManagerUiPolicies } from "./manager-ui-policies";
import { ServiceCallKanbanEnhancer } from "./service-call-kanban-enhancer";
import { ServiceCallTimelineEnhancer } from "./service-call-timeline-enhancer";
import { ServiceCallSlaDashboardV3 } from "./service-call-sla-dashboard-v3";
import { ServiceCallSlaAlertEnhancer } from "./service-call-sla-alert-enhancer";
import { ServiceCallSlaConfigShortcut } from "./service-call-sla-config-shortcut";
import { ServiceCallSlaOperationsSection } from "./service-call-sla-operations-section";
import { ServiceCallProfitabilityDashboard } from "./service-call-profitability-dashboard";
import { ServiceTechnicianCostDashboard } from "./service-technician-cost-dashboard";
import { ServiceCallClientProfitabilitySection } from "./service-call-client-profitability-section";
import { ServiceCallFinancialGoalsSection } from "./service-call-financial-goals-section";
import { ServiceCallFinancialForecastSection } from "./service-call-financial-forecast-section";
import { CashForecastDashboard } from "./cash-forecast-dashboard";
import { NetCashFlowDashboard } from "./net-cash-flow-dashboard";
import { TreasuryExecutiveDashboard } from "./treasury-executive-dashboard";
import { TreasuryExecutiveAlerts } from "./treasury-executive-alerts";
import { TreasuryAlertResponsibility } from "./treasury-alert-responsibility";
import { TreasuryMyWorkDashboard } from "./treasury-my-work-dashboard";
import { TreasuryProductivityDashboard } from "./treasury-productivity-dashboard";
import { TreasuryCapacityDashboard } from "./treasury-capacity-dashboard";
import { TreasuryRoutingProfilesDashboard } from "./treasury-routing-profiles-dashboard";
import { TreasuryRoutingSchedulesDashboard } from "./treasury-routing-schedules-dashboard";
import { TreasuryCapacityForecastDashboard } from "./treasury-capacity-forecast-dashboard";
import { TreasuryCapacityAlertsDashboard } from "./treasury-capacity-alerts-dashboard";
import { TreasuryCapacitySmartRoutingDashboard } from "./treasury-capacity-smart-routing-dashboard";
import { TreasuryCapacityRoutingEffectivenessDashboard } from "./treasury-capacity-routing-effectiveness-dashboard";
import { TreasuryDashboard } from "./treasury-dashboard";
import { TreasuryReconciliationDashboard } from "./treasury-reconciliation-dashboard";
import { TreasuryReconciliationSplitDashboard } from "./treasury-reconciliation-split-dashboard";
import { TreasuryReconciliationSmartSuggestions } from "./treasury-reconciliation-smart-suggestions";
import { FinancialLedgerDashboard } from "./financial-ledger-dashboard";
import { TreasuryClosingDashboard } from "./treasury-closing-dashboard";
import { TreasuryOfficialClosingDashboard } from "./treasury-official-closing-dashboard";
import { TreasuryClosingCalendar } from "./treasury-closing-calendar";
import { TreasuryClosingTasksDashboard } from "./treasury-closing-tasks-dashboard";
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
        <ServiceTechnicianCostDashboard />
        <ServiceCallClientProfitabilitySection />
        <ServiceCallFinancialGoalsSection />
        <ServiceCallFinancialForecastSection />
        <CashForecastDashboard />
        <NetCashFlowDashboard />
        <TreasuryExecutiveDashboard />
        <TreasuryExecutiveAlerts />
        <TreasuryAlertResponsibility />
        <TreasuryMyWorkDashboard />
        <TreasuryProductivityDashboard />
        <TreasuryCapacityDashboard />
        <TreasuryRoutingProfilesDashboard />
        <TreasuryRoutingSchedulesDashboard />
        <TreasuryCapacityForecastDashboard />
        <TreasuryCapacityAlertsDashboard />
        <TreasuryCapacitySmartRoutingDashboard />
        <TreasuryCapacityRoutingEffectivenessDashboard />
        <TreasuryDashboard />
        <TreasuryReconciliationDashboard />
        <TreasuryReconciliationSplitDashboard />
        <TreasuryReconciliationSmartSuggestions />
        <FinancialLedgerDashboard />
        <TreasuryClosingDashboard />
        <TreasuryOfficialClosingDashboard />
        <TreasuryClosingCalendar />
        <TreasuryClosingTasksDashboard />
        <TeamProfitabilityPermissionManager />
        {children}
      </body>
    </html>
  );
}
