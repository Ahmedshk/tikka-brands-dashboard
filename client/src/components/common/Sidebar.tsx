import { useState, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import { useFilteredNavigation } from '../../hooks/useFilteredNavigation';
import type { NavigationItem } from '../../types/navigation.types';
import MainLogo from '@assets/logos/main_logo.svg?react';
import ArrowUpIcon from '@assets/icons/arrow_up.svg?react';
import ArrowDownIcon from '@assets/icons/arrow_down.svg?react';

/** On these pages the sidebar always shows the default logo (location change does not affect it). */
const SIDEBAR_DEFAULT_LOGO_PATHS = new Set([
  '/dashboard/user-management',
  '/dashboard/rbac-management',
  '/dashboard/goal-setting',
  '/dashboard/location-management',
]);

interface SidebarProps {
  activePath: string;
  expandedItems: Set<string>;
  onToggleExpand: (label: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

const SidebarComponent = ({ activePath, expandedItems, onToggleExpand, isOpen, onClose, onToggle }: SidebarProps) => {
  const navigate = useNavigate();
  const filteredNav = useFilteredNavigation();
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const useDefaultLogo = SIDEBAR_DEFAULT_LOGO_PATHS.has(activePath);
  const [isMobile, setIsMobile] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [mouseStartX, setMouseStartX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Mouse drag handlers with document-level listeners
  useEffect(() => {
    if (!isMobile || !isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (mouseStartX === null) return;

      const currentX = e.clientX;
      const diff = currentX - mouseStartX;

      if (Math.abs(diff) > 5) {
        setHasDragged(true);
        buttonClickRef.shouldPrevent = true;
      }

      // Constrain drag based on current state
      const sidebarWidth = 256; // w-64 = 256px
      const newOffset = isOpen
        ? Math.min(0, Math.max(-sidebarWidth, diff)) // When open, only allow dragging left (negative)
        : Math.max(0, Math.min(sidebarWidth, diff)); // When closed, only allow dragging right (positive)

      setDragOffset(newOffset);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (mouseStartX === null) {
        setMouseStartX(null);
        setIsDragging(false);
        setDragOffset(0);
        setHasDragged(false);
        return;
      }

      const currentX = e.clientX;
      const diff = currentX - mouseStartX;
      const threshold = 50; // pixels needed to trigger open/close

      if (isOpen && diff < -threshold) {
        // Dragged left while open -> close
        onClose();
      } else if (!isOpen && diff > threshold) {
        // Dragged right while closed -> open
        onToggle();
      }

      // Reset drag state
      setMouseStartX(null);
      setIsDragging(false);
      setDragOffset(0);
      setHasDragged(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, mouseStartX, isOpen, isMobile, onClose, onToggle]);

  const isParentActive = (item: NavigationItem) => {
    if (item.path !== undefined && activePath === item.path) return true;
    return !!item.children?.some((child) => child.path === activePath);
  };

  const handleParentClick = (item: { label: string; children?: Array<{ path: string }> }) => {
    if (item.children && item.children.length > 0) {
      onToggleExpand(item.label);
    }
  };

  const handleChildClick = (path: string) => {
    navigate(path);
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

    if (Math.abs(diff) > 5) {
      setHasDragged(true);
    }

    // Constrain drag based on current state
    const sidebarWidth = 256; // w-64 = 256px
    const newOffset = isOpen
      ? Math.min(0, Math.max(-sidebarWidth, diff)) // When open, only allow dragging left (negative)
      : Math.max(0, Math.min(sidebarWidth, diff)); // When closed, only allow dragging right (positive)

    setDragOffset(newOffset);
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
      // Reset drag state even if touch is missing
      setTouchStartX(null);
      setIsDragging(false);
      setDragOffset(0);
      setHasDragged(false);
      return;
    }
    const touchEndX = touch.clientX;
    const diff = touchEndX - touchStartX;
    const threshold = 50; // pixels needed to trigger open/close

    if (isOpen && diff < -threshold) {
      // Dragged left while open -> close
      onClose();
    } else if (!isOpen && diff > threshold) {
      // Dragged right while closed -> open
      onToggle();
    }

    // Reset drag state
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

      // Constrain drag based on current state
      const sidebarWidth = 256; // w-64 = 256px
      const newOffset = isOpen
        ? Math.min(0, Math.max(-sidebarWidth, diff)) // When open, only allow dragging left (negative)
        : Math.max(0, Math.min(sidebarWidth, diff)); // When closed, only allow dragging right (positive)

      setDragOffset(newOffset);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging || mouseStartX === null) {
        setMouseStartX(null);
        setIsDragging(false);
        setDragOffset(0);
        setHasDragged(false);
        return;
      }

      const currentX = e.clientX;
      const diff = currentX - mouseStartX;
      const threshold = 50; // pixels needed to trigger open/close

      if (isOpen && diff < -threshold) {
        // Dragged left while open -> close
        onClose();
      } else if (!isOpen && diff > threshold) {
        // Dragged right while closed -> open
        onToggle();
      }

      // Reset drag state
      setMouseStartX(null);
      setIsDragging(false);
      setDragOffset(0);
      setHasDragged(false);

      // Reset button click prevention after a short delay
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

  // Track if we should prevent button click
  const buttonClickRef = { shouldPrevent: false };

  // Mobile Sidebar
  if (isMobile) {
    return (
      <>
        {/* Mobile Sidebar */}
        <aside
          className={`fixed left-0 top-0 h-full w-64 bg-card-background border-r border-gray-200 flex flex-col z-[110] lg:hidden ${isDragging ? '' : 'transition-transform duration-300 ease-in-out'
            }`}
          style={{
            transform: (() => {
              if (isDragging) {
                const offset = isOpen ? dragOffset : -256 + dragOffset;
                return `translateX(${offset}px)`;
              }
              return isOpen ? 'translateX(0)' : 'translateX(-100%)';
            })(),
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          {/* Arrow Toggle Button - attached to sidebar edge */}
          <button
            type="button"
            onClick={(e) => {
              // Prevent click if we just finished dragging
              if (buttonClickRef.shouldPrevent || hasDragged) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              onToggle();
            }}
            onMouseDown={(e) => {
              // Don't interfere with sidebar drag
              e.stopPropagation();
            }}
            className="absolute top-1/2 -translate-y-1/2 bg-button-primary hover:bg-button-primary/90 text-white w-8 h-16 flex items-center justify-center shadow-md hover:shadow-lg transition-all duration-200 z-[120] rounded-r-lg"
            style={{
              left: '256px', // Position at right edge of sidebar (256px = w-64)
            }}
            aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {isOpen ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </button>
          {/* Logo */}
          <div className="px-6 py-4 border-b border-gray-200 flex justify-center items-center">
            {useDefaultLogo || !currentLocation?.logoDataUrl ? (
              <MainLogo className="max-w-[180px] w-full" />
            ) : (
              <img src={currentLocation.logoDataUrl} alt="" className="max-w-[180px] w-full h-10 object-contain object-center" />
            )}
          </div>

          {/* Navigation Items (filtered by permissions) */}
          <nav className="flex-1 overflow-y-auto py-4 px-2">
            {filteredNav.map((item, index) => (
              <div key={item.label}>
                {item.hasSeparator && index > 0 && (
                  <div className="border-t border-gray-200 my-2" />
                )}

                {item.children ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleParentClick(item)}
                      className={`
                        w-full flex items-center justify-between px-4 py-3 cursor-pointer transition-all text-left border-0 rounded-xl
                        ${isParentActive(item)
                          ? 'bg-button-secondary'
                          : 'bg-transparent hover:bg-gray-50'
                        }
                      `}
                    >
                      <div className="flex items-center">
                        <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                        <span className="text-[10px] md:text-xs 2xl:text-sm text-primary font-medium">
                          {item.label}
                        </span>
                      </div>
                      {expandedItems.has(item.label) ? (
                        <ArrowUpIcon className="w-3 h-3 flex-shrink-0" />
                      ) : (
                        <ArrowDownIcon className="w-3 h-3 flex-shrink-0" />
                      )}
                    </button>

                    {expandedItems.has(item.label) && (
                      <div className="pl-8 pr-2">
                        {item.children.map((child) => (
                          <button
                            key={child.path}
                            type="button"
                            onClick={() => handleChildClick(child.path)}
                            className={`
                              w-full px-4 py-2 cursor-pointer transition-all text-[10px] md:text-xs 2xl:text-sm text-left border-0 rounded-xl
                              ${activePath === child.path
                                ? 'bg-button-secondary text-primary font-bold'
                                : 'bg-transparent hover:bg-gray-50 text-primary'
                              }
                            `}
                          >
                            {child.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  item.path && (
                    <button
                      type="button"
                      onClick={() => handleChildClick(item.path!)}
                      className={`
                        w-full flex items-center px-4 py-3 cursor-pointer transition-all text-left border-0 rounded-xl
                        ${activePath === item.path
                          ? 'bg-button-secondary'
                          : 'bg-transparent hover:bg-gray-50'
                        }
                      `}
                    >
                      <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                      <span
                        className={`flex-1 text-[10px] md:text-xs 2xl:text-sm ${activePath === item.path
                          ? 'quaternary font-bold'
                          : 'text-primary font-medium'
                          }`}
                      >
                        {item.label}
                      </span>
                    </button>
                  )
                )}
              </div>
            ))}
          </nav>
        </aside>
      </>
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

  return (
    <aside
      className={`hidden lg:flex bg-card-background border-r border-gray-200 flex-col h-screen shrink-0 transition-[width] duration-200 ease-in-out ${isDesktopExpanded ? 'w-64' : 'w-16'
        }`}
    >
      {/* Logo - same height as navbar (72px) so the border aligns with navbar bottom */}
      <div className={`h-[72px] min-h-[72px] border-b border-gray-200 flex items-center justify-center shrink-0 ${isDesktopExpanded ? 'px-6' : 'px-3'}`}>
        {useDefaultLogo || !currentLocation?.logoDataUrl ? (
          isDesktopExpanded ? (
            <MainLogo className="max-w-[180px] w-full" />
          ) : (
            <MainLogo className="h-8 w-8 object-contain" />
          )
        ) : isDesktopExpanded ? (
          <img src={currentLocation.logoDataUrl} alt="" className="max-w-[180px] w-full h-10 object-contain object-center" />
        ) : (
          <img src={currentLocation.logoDataUrl} alt="" className="h-8 w-8 object-contain" />
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2">
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
                        <button
                          key={child.path}
                          type="button"
                          onClick={() => handleChildClick(child.path)}
                          className={`
                            w-full px-4 py-2 cursor-pointer transition-all text-[10px] md:text-xs 2xl:text-sm text-left border-0 rounded-xl
                            ${activePath === child.path
                              ? 'bg-button-secondary text-primary font-bold'
                              : 'bg-transparent hover:bg-gray-50 text-primary'
                            }
                          `}
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                (() => {
                  const itemPath = item.path;
                  if (!itemPath) return null;

                  return (
                    <button
                      type="button"
                      onClick={() => handleChildClick(itemPath)}
                      title={isDesktopExpanded ? undefined : item.label}
                      className={`
                        w-full flex items-center rounded-xl border-0 cursor-pointer transition-all text-left
                        ${isDesktopExpanded ? 'px-4 py-3 my-4' : 'justify-center p-3 my-1'}
                        ${activePath === itemPath
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
                    </button>
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
