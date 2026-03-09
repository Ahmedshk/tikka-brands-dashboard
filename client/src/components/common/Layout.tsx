import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { useSidebar } from '../../hooks/useSidebar';

const SIDEBAR_STORAGE_KEY = 'sidebarExpanded';

function getInitialSidebarOpen(): boolean {
  if (globalThis.window === undefined) return true;
  if (globalThis.window.innerWidth < 1024) return false; // mobile: overlay always starts closed
  const stored = globalThis.localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (stored !== null) return stored === 'true';
  return true; // desktop: start expanded
}

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { activePath, expandedItems, toggleExpand } = useSidebar();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-dashboard-background overflow-hidden">
      <Sidebar 
        activePath={activePath}
        expandedItems={expandedItems}
        onToggleExpand={toggleExpand}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        onToggle={toggleSidebar}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
