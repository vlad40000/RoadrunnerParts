import React from "react";
import { StudioLayout } from "./studio-layout";

type CockpitLayoutProps = {
  children: React.ReactNode;
  rightRail?: React.ReactNode;
  headerActions?: React.ReactNode;
  sidebarContent?: React.ReactNode;
};

/**
 * 4K-friendly high-density cockpit layout for the BOM workflow.
 * Refactored to use the Gemini StudioLayout shell.
 */
export function CockpitLayout({ 
  children, 
  rightRail, 
  headerActions,
  sidebarContent 
}: CockpitLayoutProps) {
  return (
    <StudioLayout 
      breadcrumbs={["BOM Workflow", "Cockpit"]} 
      settingsRailContent={rightRail}
      headerActions={headerActions}
      sidebarContent={sidebarContent}
    >
      <div className="p-6">
        <div className="mx-auto flex w-full max-w-[2400px] flex-col gap-4">
          <div className="relative z-10 flex min-w-0 flex-col gap-4 overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </StudioLayout>
  );
}
