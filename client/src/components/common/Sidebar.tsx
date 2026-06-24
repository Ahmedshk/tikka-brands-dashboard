import { useState, useEffect, memo } from 'react';
import { NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentLocation } from '../../store/locationSelectors';
import { useFilteredNavigation } from '../../hooks/useFilteredNavigation';
import type { NavigationItem } from '../../types/navigation.types';
import MainLogo from '@assets/logos/main_logo.svg?react';
import ArrowUpIcon from '@assets/icons/arrow_up.svg?react';
import ArrowDownIcon from '@assets/icons/arrow_down.svg?react';
import {
  SIDEBAR_DEFAULT_LOGO_PATHS,
  getConstrainedDragOffsetWhenOpen,
  getConstrainedDragOffsetWhenClosed,
  applyDragEndWhenOpen,
  applyDragEndWhenClosed,
} from '../../utils/sidebarHelpers';
import { MobileSidebar } from './MobileSidebar';

interface SidebarProps {
  activePath: string;
  expandedItems: Set<string>;
  onToggleExpand: (label: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

const SidebarComponent = ({ activePath, expandedItems, onToggleExpand, isOpen, onClose, onToggle }: SidebarProps) => {
  const filteredNav = useFilteredNavigation();
  const currentLocation = useSelector(selectCurrentLocation);
  const useDefaultLogo = SIDEBAR_DEFAULT_LOGO_PATHS.has(activePath);
  const [isMobile, setIsMobile] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [mouseStartX, setMouseStartX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);
  const buttonClickRef = { shouldPrevent: false };

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const isParentActive = (item: NavigationItem) => {
    if (item.path !== undefined && activePath === item.path) return true;
    return !!item.children?.some((child) => child.path === activePath);
  };

  const handleParentClick = (item: { label: string; children?: Array<{ path: string }> }) => {
    if (item.children && item.children.length > 0) {
      onToggleExpand(item.label);
    }
  };

  const handleNavItemClick = () => {
    if (isMobile) {
      onClose();
    }
  };

  // Touch drag handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    setTouchStartX(touch.clientX);
    setIsDragging(true);
    setDragOffset(0);
    setHasDragged(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || touchStartX === null) return;

    const touch = e.touches[0];
    if (!touch) return;
    const currentX = touch.clientX;
    const diff = currentX - touchStartX;

    if (Math.abs(diff) > 5) setHasDragged(true);
    setDragOffset(isOpen ? getConstrainedDragOffsetWhenOpen(diff) : getConstrainedDragOffsetWhenClosed(diff));
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging || touchStartX === null) {
      setTouchStartX(null);
      setIsDragging(false);
      setDragOffset(0);
      setHasDragged(false);
      return;
    }
    const touch = e.changedTouches[0];
    if (!touch) {
      setTouchStartX(null);
      setIsDragging(false);
      setDragOffset(0);
      setHasDragged(false);
      return;
    }
    const diff = touch.clientX - touchStartX;
    if (isOpen) applyDragEndWhenOpen(diff, onClose);
    else applyDragEndWhenClosed(diff, onToggle);
    setTouchStartX(null);
    setIsDragging(false);
    setDragOffset(0);
    setHasDragged(false);
  };

  // Mouse drag handlers
  useEffect(() => {
    if (!isMobile) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || mouseStartX === null) return;

      const currentX = e.clientX;
      const diff = currentX - mouseStartX;

      if (Math.abs(diff) > 5) {
        setHasDragged(true);
        buttonClickRef.shouldPrevent = true;
      }
      setDragOffset(isOpen ? getConstrainedDragOffsetWhenOpen(diff) : getConstrainedDragOffsetWhenClosed(diff));
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging || mouseStartX === null) {
        setMouseStartX(null);
        setIsDragging(false);
        setDragOffset(0);
        setHasDragged(false);
        return;
      }
      const diff = e.clientX - mouseStartX;
      if (isOpen) applyDragEndWhenOpen(diff, onClose);
      else applyDragEndWhenClosed(diff, onToggle);
      setMouseStartX(null);
      setIsDragging(false);
      setDragOffset(0);
      setHasDragged(false);
      setTimeout(() => {
        buttonClickRef.shouldPrevent = false;
      }, 100);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, mouseStartX, isOpen, isMobile, onClose, onToggle]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setMouseStartX(e.clientX);
    setIsDragging(true);
    setDragOffset(0);
    setHasDragged(false);
    buttonClickRef.shouldPrevent = false;
  };

  if (isMobile) {
    return (
      <MobileSidebar
        isOpen={isOpen}
        onToggle={onToggle}
        isDragging={isDragging}
        dragOffset={dragOffset}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        buttonClickRef={buttonClickRef}
        hasDragged={hasDragged}
        useDefaultLogo={useDefaultLogo}
        currentLocation={currentLocation}
        filteredNav={filteredNav}
        activePath={activePath}
        expandedItems={expandedItems}
        onParentClick={handleParentClick}
        onNavItemClick={handleNavItemClick}
        isParentActive={isParentActive}
      />
    );
  }

  // Desktop Sidebar (collapsible)
  const isDesktopExpanded = isOpen;

  const handleDesktopParentClick = (item: NavigationItem) => {
    if (item.children && item.children.length > 0) {
      if (!isDesktopExpanded) {
        onToggle(); // Expand sidebar so user can pick a child
      }
      onToggleExpand(item.label);
    }
  };

  let desktopLogoContent: React.ReactNode;
  if (useDefaultLogo || !currentLocation?.logoUrl) {
    desktopLogoContent = isDesktopExpanded ? (
      <MainLogo className="max-w-[180px] w-full" />
    ) : (
      <MainLogo className="h-8 w-8 object-contain" />
    );
  } else {
    desktopLogoContent = isDesktopExpanded ? (
      <img src={currentLocation.logoUrl} alt="" className="max-w-[180px] w-full h-10 object-contain object-center" />
    ) : (
      <img src={currentLocation.logoUrl} alt="" className="h-8 w-8 object-contain" />
    );
  }

  return (
    <aside
      className={`hidden lg:flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-card-background transition-[width] duration-200 ease-in-out ${isDesktopExpanded ? 'w-64' : 'w-16'
        }`}
    >
      {/* Logo - same height as navbar (72px) so the border aligns with navbar bottom */}
      <div className={`h-[72px] min-h-[72px] border-b border-gray-200 flex items-center justify-center shrink-0 ${isDesktopExpanded ? 'px-6' : 'px-3'}`}>
        {desktopLogoContent}
      </div>

      {/* Navigation Items */}
      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-4 px-2">
        {filteredNav.map((item, index) => (
          <div key={item.label}>
              {item.hasSeparator && index > 0 && (
                <div className="border-t border-gray-200 my-2" />
              )}

              {item.children ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleDesktopParentClick(item)}
                    title={isDesktopExpanded ? undefined : item.label}
                    className={`
                      w-full flex items-center rounded-xl border-0 cursor-pointer transition-all text-left
                      ${isDesktopExpanded ? 'justify-between px-4 py-3 my-4' : 'justify-center p-3 my-1'}
                      ${isParentActive(item)
                        ? 'bg-button-secondary'
                        : 'bg-transparent hover:bg-gray-50'
                      }
                    `}
                  >
                    <div className="flex items-center min-w-0 flex-1">
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {isDesktopExpanded && (
                        <span className="ml-3 flex-1 min-w-0 truncate text-[10px] md:text-xs 2xl:text-sm text-primary font-medium">
                          {item.label}
                        </span>
                      )}
                    </div>
                    {isDesktopExpanded && (expandedItems.has(item.label) ? (
                      <ArrowUpIcon className="w-3 h-3 flex-shrink-0" />
                    ) : (
                      <ArrowDownIcon className="w-3 h-3 flex-shrink-0" />
                    ))}
                  </button>

                  {isDesktopExpanded && expandedItems.has(item.label) && (
                    <div className="pl-8 pr-2">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          className={({ isActive }) => `
                            block w-full px-4 py-2 cursor-pointer transition-all text-[10px] md:text-xs 2xl:text-sm text-left no-underline rounded-xl
                            ${isActive
                              ? 'bg-button-secondary text-primary font-bold'
                              : 'bg-transparent hover:bg-gray-50 text-primary'
                            }
                          `}
                        >
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                (() => {
                  const itemPath = item.path;
                  if (!itemPath) return null;

                  return (
                    <NavLink
                      to={itemPath}
                      title={isDesktopExpanded ? undefined : item.label}
                      className={({ isActive }) => `
                        w-full flex items-center rounded-xl no-underline cursor-pointer transition-all text-left
                        ${isDesktopExpanded ? 'px-4 py-3 my-4' : 'justify-center p-3 my-1'}
                        ${isActive
                          ? 'bg-button-secondary'
                          : 'bg-transparent hover:bg-gray-50'
                        }
                      `}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {isDesktopExpanded && (
                        <span
                          className={`ml-3 flex-1 text-[10px] md:text-xs 2xl:text-sm truncate ${activePath === itemPath ? 'font-bold text-quaternary' : 'text-primary font-medium'
                            }`}
                        >
                          {item.label}
                        </span>
                      )}
                    </NavLink>
                  );
                })()
              )}
          </div>
        ))}
      </nav>

      {/* Collapse / Expand toggle */}
      <div className="shrink-0 border-t border-gray-200 p-2">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer text-primary"
          aria-label={isDesktopExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isDesktopExpanded ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
    </aside>
  );
};

// Memoize with custom comparison to only rerender when props change
export const Sidebar = memo(SidebarComponent, (prevProps: SidebarProps, nextProps: SidebarProps) => {
  // Only rerender if activePath, expandedItems, or isOpen actually changed
  if (prevProps.activePath !== nextProps.activePath) {
    return false; // Props changed, should rerender
  }

  if (prevProps.isOpen !== nextProps.isOpen) {
    return false; // Open state changed, should rerender
  }

  // Compare expanded items sets
  if (prevProps.expandedItems.size !== nextProps.expandedItems.size) {
    return false; // Size changed, should rerender
  }

  // Check if any items were added or removed
  for (const item of prevProps.expandedItems) {
    if (!nextProps.expandedItems.has(item)) {
      return false; // Item removed, should rerender
    }
  }

  for (const item of nextProps.expandedItems) {
    if (!prevProps.expandedItems.has(item)) {
      return false; // Item added, should rerender
    }
  }

  // Props are the same, skip rerender
  return true;
});
