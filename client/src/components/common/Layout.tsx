import { ReactNode, useState } from 'react';
import { useSelector } from 'react-redux';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { Spinner } from './Spinner';
import { useSidebar } from '../../hooks/useSidebar';
import type { RootState } from '../../store/store';

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
  const locationListHydrated = useSelector((state: RootState) => state.location.listHydrated);
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
    <div className="fixed inset-0 z-0 flex overflow-hidden bg-dashboard-background">
      <Sidebar 
        activePath={activePath}
        expandedItems={expandedItems}
        onToggleExpand={toggleExpand}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        onToggle={toggleSidebar}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
          {locationListHydrated ? (
            children
          ) : (
            <div
              className="flex flex-1 min-h-[40vh] items-center justify-center px-4"
              aria-busy="true"
              aria-label="Loading locations"
            >
              <Spinner size="lg" className="text-button-primary" />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
