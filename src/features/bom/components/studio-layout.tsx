import React from "react";
import { 
  Menu, 
  Search, 
  Settings, 
  HelpCircle, 
  Bell, 
  User, 
  ChevronRight, 
  Home, 
  Workflow, 
  FileCode, 
  Database, 
  Terminal,
  ChevronLeft,
  Zap,
  Layout
} from "lucide-react";

interface StudioLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: string[];
  sidebarContent?: React.ReactNode;
  settingsRailContent?: React.ReactNode;
  headerActions?: React.ReactNode;
}

export function StudioLayout({ 
  children, 
  breadcrumbs = ["Home"], 
  sidebarContent,
  settingsRailContent,
  headerActions
}: StudioLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(true);

  return (
    <div className="flex h-screen w-full bg-studio-bg text-studio-text overflow-hidden font-sans">
      {/* Sidebar */}
      <aside 
        className={`bg-studio-sidebar border-r border-studio-border transition-all duration-300 ease-in-out flex flex-col ${
          isSidebarOpen ? "w-64" : "w-16"
        }`}
      >
        <div className="h-16 flex items-center px-4 shrink-0">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="studio-header-btn"
          >
            <Menu size={20} />
          </button>
          {isSidebarOpen && (
            <span className="ml-3 font-semibold text-lg tracking-tight">BOM Studio</span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-4 pr-4">
          <SidebarItem 
            icon={<Home size={18} />} 
            label="Dashboard" 
            isOpen={isSidebarOpen} 
            active 
          />
          <SidebarItem 
            icon={<Workflow size={18} />} 
            label="BOM Workflow" 
            isOpen={isSidebarOpen} 
          />
          <SidebarItem 
            icon={<FileCode size={18} />} 
            label="Prompt Library" 
            isOpen={isSidebarOpen} 
          />
          <SidebarItem 
            icon={<Database size={18} />} 
            label="Parts Cache" 
            isOpen={isSidebarOpen} 
          />
          <div className="my-4 border-t border-studio-border/50 ml-4" />
          <SidebarItem 
            icon={<Terminal size={18} />} 
            label="Console" 
            isOpen={isSidebarOpen} 
          />
          {sidebarContent}
        </nav>

        <div className="p-4 border-t border-studio-border/50 shrink-0">
          <SidebarItem 
            icon={<Settings size={18} />} 
            label="Settings" 
            isOpen={isSidebarOpen} 
          />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white">
        {/* Header */}
        <header className="h-16 border-b border-studio-border flex items-center justify-between px-6 shrink-0 bg-white z-10">
          <div className="flex items-center gap-2 text-sm text-studio-text-secondary">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight size={14} />}
                <span className={i === breadcrumbs.length - 1 ? "text-studio-text font-medium" : ""}>
                  {crumb}
                </span>
              </React.Fragment>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {headerActions}
            <div className="relative group hidden md:block">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-studio-text-secondary">
                <Search size={16} />
              </div>
              <input 
                type="text" 
                placeholder="Search..." 
                className="bg-studio-bg border border-studio-border rounded-full py-1.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-studio-blue/20 focus:border-studio-blue w-64 transition-all"
              />
            </div>
            <button className="studio-header-btn"><HelpCircle size={20} /></button>
            <button className="studio-header-btn"><Bell size={20} /></button>
            <button className="ml-2 w-8 h-8 rounded-full bg-studio-blue text-white flex items-center justify-center font-bold text-xs">
              BP
            </button>
          </div>
        </header>

        {/* Workspace */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Workspace */}
          <div className="flex-1 overflow-y-auto bg-studio-bg/30">
            {children}
          </div>

          {/* Right Settings Rail */}
          {settingsRailContent && (
            <aside 
              className={`bg-white border-l border-studio-border transition-all duration-300 ease-in-out flex flex-col ${
                isSettingsOpen ? "w-80" : "w-0 overflow-hidden border-none"
              }`}
            >
              <div className="h-14 border-b border-studio-border flex items-center justify-between px-4 shrink-0 bg-white">
                <span className="font-semibold text-sm uppercase tracking-wider text-studio-text-secondary">Settings</span>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="studio-header-btn"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {settingsRailContent}
              </div>
            </aside>
          )}

          {!isSettingsOpen && settingsRailContent && (
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="absolute right-0 top-1/2 -translate-y-1/2 bg-white border border-r-0 border-studio-border p-1 rounded-l-md shadow-sm z-20"
            >
              <ChevronLeft size={18} />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function SidebarItem({ 
  icon, 
  label, 
  isOpen, 
  active = false 
}: { 
  icon: React.ReactNode; 
  label: string; 
  isOpen: boolean;
  active?: boolean;
}) {
  return (
    <div className={`studio-sidebar-item ${active ? "studio-sidebar-item-active" : "hover:bg-black/5"}`}>
      <span className="shrink-0">{icon}</span>
      {isOpen && <span className="truncate">{label}</span>}
    </div>
  );
}
