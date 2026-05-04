import React from "react";

type CockpitLayoutProps = {
  children: React.ReactNode;
  rightRail?: React.ReactNode;
};

/**
 * 4K-friendly high-density cockpit layout for the BOM workflow.
 * Uses a primary-secondary grid structure to prioritize the BOM table
 * while keeping agent/tooling logic in a constrained right sidebar.
 */
export function CockpitLayout({ children, rightRail }: CockpitLayoutProps) {
  return (
    <main className="min-h-screen bg-neutral-100 p-4 text-neutral-950 overflow-x-hidden">
      <div className="mx-auto flex w-full max-w-[2400px] flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_460px]">
          {/* Main Content Area (BOM Table, Job Controls) */}
          <div className="flex flex-col gap-4 overflow-hidden">
            {children}
          </div>

          {/* Right Rail (Agent Supervision, Supplier Matrix, Console) */}
          {rightRail && (
            <aside className="flex flex-col gap-4 min-w-0">
              {rightRail}
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
