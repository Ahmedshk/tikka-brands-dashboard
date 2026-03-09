import type { NavigationItem } from '../../types/navigation.types';
import MainLogo from '@assets/logos/main_logo.svg?react';
import ArrowUpIcon from '@assets/icons/arrow_up.svg?react';
import ArrowDownIcon from '@assets/icons/arrow_down.svg?react';
import {
  getMobileSidebarTransformWhenOpen,
  getMobileSidebarTransformWhenClosed,
  SIDEBAR_WIDTH,
} from '../../utils/sidebarHelpers';

export interface MobileSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  isDragging: boolean;
  dragOffset: number;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  buttonClickRef: { shouldPrevent: boolean };
  hasDragged: boolean;
  useDefaultLogo: boolean;
  currentLocation: { logoDataUrl?: string } | null;
  filteredNav: NavigationItem[];
  activePath: string;
  expandedItems: Set<string>;
  onParentClick: (item: { label: string; children?: Array<{ path: string }> }) => void;
  onChildClick: (path: string) => void;
  isParentActive: (item: NavigationItem) => boolean;
}

export function MobileSidebar(props: Readonly<MobileSidebarProps>) {
  const {
    isOpen,
    onToggle,
    isDragging,
    dragOffset,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    buttonClickRef,
    hasDragged,
    useDefaultLogo,
    currentLocation,
    filteredNav,
    activePath,
    expandedItems,
    onParentClick,
    onChildClick,
    isParentActive,
  } = props;
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Draggable sidebar panel requires touch/mouse handlers on the container
    <aside
      role="application"
      aria-label="Sidebar"
      className={`fixed left-0 top-0 h-full w-64 bg-card-background border-r border-gray-200 flex flex-col z-[110] lg:hidden ${isDragging ? '' : 'transition-transform duration-300 ease-in-out'}`}
      style={{
        transform: isOpen
          ? getMobileSidebarTransformWhenOpen(isDragging, dragOffset)
          : getMobileSidebarTransformWhenClosed(isDragging, dragOffset),
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
    >
      <button
        type="button"
        onClick={(e) => {
          if (buttonClickRef.shouldPrevent || hasDragged) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          onToggle();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-1/2 -translate-y-1/2 bg-button-primary hover:bg-button-primary/90 text-white w-8 h-16 flex items-center justify-center shadow-md hover:shadow-lg transition-all duration-200 z-[120] rounded-r-lg"
        style={{ left: `${SIDEBAR_WIDTH}px` }}
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {isOpen ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>
      <div className="px-6 py-4 border-b border-gray-200 flex justify-center items-center">
        {useDefaultLogo || !currentLocation?.logoDataUrl ? (
          <MainLogo className="max-w-[180px] w-full" />
        ) : (
          <img src={currentLocation.logoDataUrl} alt="" className="max-w-[180px] w-full h-10 object-contain object-center" />
        )}
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {filteredNav.map((item, index) => (
          <div key={item.label}>
            {item.hasSeparator && index > 0 && <div className="border-t border-gray-200 my-2" />}
            {item.children ? (
              <>
                <button
                  type="button"
                  onClick={() => onParentClick(item)}
                  className={`w-full flex items-center justify-between px-4 py-3 cursor-pointer transition-all text-left border-0 rounded-xl ${isParentActive(item) ? 'bg-button-secondary' : 'bg-transparent hover:bg-gray-50'}`}
                >
                  <div className="flex items-center">
                    <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                    <span className="text-[10px] md:text-xs 2xl:text-sm text-primary font-medium">{item.label}</span>
                  </div>
                  {expandedItems.has(item.label) ? <ArrowUpIcon className="w-3 h-3 flex-shrink-0" /> : <ArrowDownIcon className="w-3 h-3 flex-shrink-0" />}
                </button>
                {expandedItems.has(item.label) && (
                  <div className="pl-8 pr-2">
                    {item.children.map((child) => (
                      <button
                        key={child.path}
                        type="button"
                        onClick={() => onChildClick(child.path)}
                        className={`w-full px-4 py-2 cursor-pointer transition-all text-[10px] md:text-xs 2xl:text-sm text-left border-0 rounded-xl ${activePath === child.path ? 'bg-button-secondary text-primary font-bold' : 'bg-transparent hover:bg-gray-50 text-primary'}`}
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
                  onClick={() => onChildClick(item.path!)}
                  className={`w-full flex items-center px-4 py-3 cursor-pointer transition-all text-left border-0 rounded-xl ${activePath === item.path ? 'bg-button-secondary' : 'bg-transparent hover:bg-gray-50'}`}
                >
                  <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                  <span className={`flex-1 text-[10px] md:text-xs 2xl:text-sm ${activePath === item.path ? 'quaternary font-bold' : 'text-primary font-medium'}`}>
                    {item.label}
                  </span>
                </button>
              )
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
