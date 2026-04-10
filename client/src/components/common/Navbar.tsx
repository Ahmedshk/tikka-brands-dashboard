import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store/store';
import { setCurrentLocation, setLocationListHydrated, getStoredLocationId } from '../../store/slices/location.slice';
import {
  setUnreadCount,
  setNotifications,
  appendNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../store/slices/notification.slice';
import { locationService } from '../../services/location.service';
import { notificationService } from '../../services/notification.service';
import type { NotificationItem } from '../../services/notification.service';
import { useAuth } from '../../hooks/useAuth';
import type { LocationListItem } from '../../types';
import { canAccessPage } from '../../config/permissions.config';
import {
  getNotificationNavigationTarget,
  resolveNotificationLocationLabel,
} from '../../utils/notificationNavigation';
import toast from 'react-hot-toast';
import { Spinner } from './Spinner';
import { Dropdown } from './Dropdown';
import LocationIcon from '@assets/icons/location.svg?react';
import NotificationIcon from '@assets/icons/notification.svg?react';
import ArrowDownIcon from '@assets/icons/arrow_down.svg?react';

const HamburgerIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const CloseIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const LogoutIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

function formatTimeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const NOTIFICATIONS_PAGE_SIZE = 10;
const LG_BREAKPOINT_PX = 1024;

type NavbarNotificationListProps = {
  notifications: NotificationItem[];
  locations: LocationListItem[];
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /** Only attach infinite-scroll observer when this panel is visible (avoids duplicate loads from hidden duplicate DOM). */
  infiniteScrollActive: boolean;
  onLoadMore: () => void;
  dense?: boolean;
  onNotificationClick: (n: NotificationItem) => void;
};

function NavbarNotificationList({
  notifications,
  locations,
  loadingInitial,
  loadingMore,
  hasMore,
  infiniteScrollActive,
  onLoadMore,
  dense,
  onNotificationClick,
}: Readonly<NavbarNotificationListProps>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      !infiniteScrollActive ||
      loadingInitial ||
      notifications.length === 0 ||
      !hasMore ||
      loadingMore
    ) {
      return;
    }
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { root, rootMargin: '0px 0px 120px 0px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    infiniteScrollActive,
    loadingInitial,
    notifications.length,
    hasMore,
    loadingMore,
    onLoadMore,
  ]);

  if (loadingInitial) {
    return (
      <div className="overflow-y-auto flex-1 min-h-[200px] flex items-center justify-center py-8">
        <Spinner size="lg" className="text-button-primary" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="overflow-y-auto flex-1">
        <p className="text-sm text-gray-500 p-4 text-center">No notifications</p>
      </div>
    );
  }

  const itemPy = dense ? 'py-2.5' : 'py-3';
  const titleClass = dense ? 'text-xs font-medium text-primary truncate' : 'text-sm font-medium text-primary truncate';
  const timeClass = dense ? 'text-xs text-gray-400 mt-0.5' : 'text-xs text-gray-400 mt-1';

  return (
    <>
      <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-0">
        {notifications.map((n) => {
          const navTarget = getNotificationNavigationTarget(n);
          const locationLine = resolveNotificationLocationLabel(n, locations);
          const hasNavTarget = navTarget != null;
          let ariaLabel = `${n.title}.`;
          if (!n.isRead) ariaLabel += ' Unread.';
          if (hasNavTarget) ariaLabel += ' Open related page.';
          return (
            <button
              key={n._id}
              type="button"
              aria-label={ariaLabel}
              onClick={() => onNotificationClick(n)}
              className={`w-full text-left px-4 ${itemPy} border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${n.isRead ? '' : 'bg-blue-50/40'}`}
            >
              <div className="flex items-start gap-2">
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-button-primary mt-1.5 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className={titleClass}>{n.title}</p>
                  {locationLine && (
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 truncate">
                      <LocationIcon className="w-3 h-3 flex-shrink-0" aria-hidden />
                      <span className="truncate">{locationLine}</span>
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className={timeClass}>{formatTimeAgo(n.createdAt)}</p>
                </div>
              </div>
            </button>
          );
        })}
        {hasMore && !loadingMore && (
          <div ref={sentinelRef} className="h-2 w-full shrink-0" aria-hidden />
        )}
      </div>
      {loadingMore && (
        <div className="flex-shrink-0 flex justify-center items-center min-h-12 py-3 px-4 border-t border-gray-100 bg-gray-50/50">
          <span className="sr-only">Loading more notifications</span>
          <Spinner size="sm" className="text-button-primary" />
        </div>
      )}
    </>
  );
}

const LOCATION_MANAGEMENT_PATH = '/dashboard/location-management';
const USER_MANAGEMENT_PATH = '/dashboard/user-management';
const RBAC_MANAGEMENT_PATH = '/dashboard/rbac-management';
const GOAL_SETTING_PATH = '/dashboard/goal-setting';
const TRAINING_SETTINGS_PATH = '/dashboard/training-settings';
const REVIEW_SETTINGS_PATH = '/dashboard/review-settings';
const DISCIPLINARY_SETTINGS_PATH = '/dashboard/disciplinary-settings';
const EVENTS_NOTIFICATIONS_SETTINGS_PATH = '/dashboard/events-notifications-settings';
const ALERTS_NOTIFICATIONS_SETTINGS_PATH = '/dashboard/alerts-notifications-settings';
const DATA_SYNC_SETTINGS_PATH = '/dashboard/data-sync-settings';

export const Navbar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { logout } = useAuth();
  const user = useSelector((state: RootState) => state.auth.user);
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  const hideLocationSelector =
    pathname === LOCATION_MANAGEMENT_PATH ||
    pathname === USER_MANAGEMENT_PATH ||
    pathname.startsWith(RBAC_MANAGEMENT_PATH) ||
    pathname === GOAL_SETTING_PATH ||
    pathname === TRAINING_SETTINGS_PATH ||
    pathname === REVIEW_SETTINGS_PATH ||
    pathname === DISCIPLINARY_SETTINGS_PATH ||
    pathname === EVENTS_NOTIFICATIONS_SETTINGS_PATH ||
    pathname === ALERTS_NOTIFICATIONS_SETTINGS_PATH ||
    pathname === DATA_SYNC_SETTINGS_PATH;
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const notificationCount = useSelector((state: RootState) => state.notification.unreadCount);
  const notifications = useSelector((state: RootState) => state.notification.notifications);
  const notificationListLoaded = useSelector((state: RootState) => state.notification.isLoaded);
  const notificationListPage = useSelector((state: RootState) => state.notification.listPage);
  const notificationListHasMore = useSelector((state: RootState) => state.notification.listHasMore);
  /** Must not be in the fetch effect deps: when the fetch succeeds, `isLoaded` flips true and would re-run the effect, run cleanup (`cancelled = true`), and skip `setNotifLoadingInitial(false)` in `finally`. */
  const notificationListLoadedRef = useRef(notificationListLoaded);
  notificationListLoadedRef.current = notificationListLoaded;

  const [notifLoadingInitial, setNotifLoadingInitial] = useState(false);
  const [notifLoadingMore, setNotifLoadingMore] = useState(false);
  const [isLgUp, setIsLgUp] = useState(() =>
    typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia(`(min-width: ${LG_BREAKPOINT_PX}px)`).matches
      : false,
  );
  const loadMoreInFlightRef = useRef(false);

  useEffect(() => {
    const mq = globalThis.matchMedia(`(min-width: ${LG_BREAKPOINT_PX}px)`);
    setIsLgUp(mq.matches);
    const onChange = () => setIsLgUp(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!user) return;
    const ac = new AbortController();
    notificationService
      .getUnreadCount({ signal: ac.signal })
      .then((c) => dispatch(setUnreadCount(c)))
      .catch(() => {});
    return () => ac.abort();
  }, [user?._id, dispatch]);

  useEffect(() => {
    if (!notificationDropdownOpen || notificationListLoadedRef.current) return;
    let cancelled = false;
    setNotifLoadingInitial(true);
    notificationService
      .getNotifications({ page: 1, limit: NOTIFICATIONS_PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        dispatch(
          setNotifications({
            notifications: res.notifications,
            page: res.page,
            totalPages: res.totalPages,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) {
          dispatch(
            setNotifications({
              notifications: [],
              page: 1,
              totalPages: 0,
            }),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setNotifLoadingInitial(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notificationDropdownOpen, dispatch]);

  const loadMoreNotifications = useCallback(() => {
    if (
      !notificationListHasMore ||
      notifLoadingMore ||
      notifLoadingInitial ||
      loadMoreInFlightRef.current
    ) {
      return;
    }
    loadMoreInFlightRef.current = true;
    setNotifLoadingMore(true);
    const nextPage = notificationListPage + 1;
    notificationService
      .getNotifications({ page: nextPage, limit: NOTIFICATIONS_PAGE_SIZE })
      .then((res) => {
        dispatch(
          appendNotifications({
            notifications: res.notifications,
            page: res.page,
            totalPages: res.totalPages,
          }),
        );
      })
      .catch(() => {})
      .finally(() => {
        loadMoreInFlightRef.current = false;
        setNotifLoadingMore(false);
      });
  }, [
    notificationListHasMore,
    notificationListPage,
    notifLoadingMore,
    notifLoadingInitial,
    dispatch,
  ]);

  const handleMarkRead = useCallback((id: string) => {
    dispatch(markNotificationRead(id));
    notificationService.markAsRead(id).catch(() => {});
  }, [dispatch]);

  const handleNotificationClick = useCallback(
    (n: NotificationItem) => {
      if (!n.isRead) handleMarkRead(n._id);
      const target = getNotificationNavigationTarget(n);
      if (!target) return;
      if (!canAccessPage(user?.permissions, target.pageId)) {
        toast.error("You don't have access to that page.");
        return;
      }
      const lid =
        n.data && typeof n.data.locationId === 'string' ? n.data.locationId.trim() : '';
      if (lid) {
        const loc = locations.find((l) => l._id === lid);
        if (loc) dispatch(setCurrentLocation(loc));
      }
      navigate(target.path);
      setNotificationDropdownOpen(false);
      setMobileMenuOpen(false);
    },
    [dispatch, handleMarkRead, locations, navigate, user?.permissions],
  );

  const handleMarkAllRead = useCallback(() => {
    dispatch(markAllNotificationsRead());
    notificationService.markAllAsRead().catch(() => {});
  }, [dispatch]);

  // Fetch locations and sync current location from storage or first location.
  // Refetch when user's allowed locations change (e.g. after admin changes role) so dropdown updates.
  const allowedLocationIdsKey = Array.isArray(user?.allowedLocationIds)
    ? user.allowedLocationIds.join(',')
    : user?.allowedLocationIds ?? '';
  const locationRemovalsKey = (user?.locationRemovals ?? []).join(',');
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLocationsLoading(true);
      try {
        const data = await locationService.getAll({ signal: controller.signal });
        if (controller.signal.aborted) return;
        setLocations(data);
        const storedId = getStoredLocationId();
        const match = data.find((loc) => loc._id === storedId);
        if (match) {
          dispatch(setCurrentLocation(match));
        } else if (data.length > 0 && !currentLocation) {
          dispatch(setCurrentLocation(data[0] ?? null));
        }
      } catch {
        if (!controller.signal.aborted) setLocations([]);
      } finally {
        if (!controller.signal.aborted) {
          setLocationsLoading(false);
          dispatch(setLocationListHydrated(true));
        }
      }
    })();
    return () => controller.abort();
  }, [dispatch, allowedLocationIdsKey, locationRemovalsKey]);

  // Keep current location in sync if it was removed from list (e.g. deleted elsewhere)
  useEffect(() => {
    if (!currentLocation || locations.length === 0) return;
    const stillExists = locations.some((loc) => loc._id === currentLocation._id);
    if (!stillExists) dispatch(setCurrentLocation(locations[0] ?? null));
  }, [locations, currentLocation, dispatch]);

  const locationsRefreshController = useRef<AbortController | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const notificationMobileRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inNotification = notificationRef.current?.contains(target) || notificationMobileRef.current?.contains(target);
      if (!inNotification) setNotificationDropdownOpen(false);
      const inUser = userRef.current?.contains(target);
      if (!inUser) setUserDropdownOpen(false);
      if (window.innerWidth < 1024 && mobileMenuRef.current && !mobileMenuRef.current.contains(target)) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Generate user initials
  const getUserInitials = () => {
    if (!user) return 'U';
    const first = user.firstName.charAt(0).toUpperCase();
    const second = user.lastName.charAt(0).toUpperCase();
    return `${first}${second}`;
  };

  // Get user display name
  const getUserDisplayName = () => {
    if (!user) return 'User';
    return `${user.firstName} ${user.lastName}`;
  };

  // Get user role display
  const getUserRole = () => {
    if (!user) return '';
    return user.role;
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  let locationPlaceholder: string;
  if (locationsLoading) {
    locationPlaceholder = 'Loading...';
  } else if (locations.length === 0) {
    locationPlaceholder = 'No locations';
  } else {
    locationPlaceholder = 'Select location';
  }

  let locationTriggerContent: ReactNode;
  if (locationsLoading) {
    locationTriggerContent = (
      <>
        <Spinner size="sm" className="flex-shrink-0 text-button-primary" />
        <span className="text-xs md:text-sm 2xl:text-base text-primary">Loading...</span>
      </>
    );
  } else if (currentLocation) {
    const title = currentLocation.storeName;
    locationTriggerContent = (
      <span className="text-xs md:text-sm 2xl:text-base text-primary truncate" title={title}>
        {currentLocation.storeName}
      </span>
    );
  } else if (locations.length === 0) {
    locationTriggerContent = (
      <span className="text-xs md:text-sm 2xl:text-base text-primary">No locations</span>
    );
  } else {
    locationTriggerContent = (
      <span className="text-xs md:text-sm 2xl:text-base text-secondary">Select location</span>
    );
  }

  return (
    <nav className="relative z-20 shrink-0 bg-card-background border-b border-gray-200 min-h-[72px] flex flex-col" ref={mobileMenuRef}>
      <div className="flex items-center justify-between gap-2 px-4 sm:px-6 lg:px-8 h-[72px] shrink-0">
        {/* Spacer when location selector is hidden (e.g. Location Management) so notifications/profile stay right */}
        {hideLocationSelector && <div className="min-w-0 flex-1" />}
        {/* Location Selector - hidden on Location Management so updates apply to the store being edited */}
        {!hideLocationSelector && (
          <div className="min-w-0 flex-1 w-full lg:flex-initial lg:max-w-md xl:max-w-xl">
            <Dropdown
              options={locations.map((loc) => ({ value: loc._id, label: loc.storeName }))}
              value={currentLocation?._id ?? ''}
              onChange={(id) => {
                const loc = locations.find((l) => l._id === id);
                if (loc) dispatch(setCurrentLocation(loc));
              }}
              placeholder={locationPlaceholder}
              aria-label="Select location"
              className="w-full"
              allowEmpty={true}
              disabled={locationsLoading}
              triggerLabel={
                <span className="flex items-center gap-2 min-w-0 flex-1 text-left">
                  <LocationIcon className="w-4 h-4 md:w-4.5 md:h-4.5 2xl:w-5 2xl:h-5 flex-shrink-0" />
                  {locationTriggerContent}
                </span>
              }
              onOpenChange={(open) => {
                if (open) {
                  locationsRefreshController.current?.abort();
                  const controller = new AbortController();
                  locationsRefreshController.current = controller;
                  locationService.getAll({ signal: controller.signal }).then((data) => {
                    if (controller.signal.aborted) return;
                    setLocations(data);
                    const stillExists = currentLocation && data.some((loc) => loc._id === currentLocation._id);
                    if (currentLocation && !stillExists && data.length > 0) dispatch(setCurrentLocation(data[0] ?? null));
                  }).catch(() => {});
                }
              }}
            />
          </div>
        )}

        {/* Desktop: Notifications and User Profile */}
        <div className="hidden lg:flex items-center gap-4">
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => setNotificationDropdownOpen(!notificationDropdownOpen)}
              className="relative p-2 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
            >
              <NotificationIcon className="w-6 h-6" />
              {notificationCount > 0 && (
                <span
                  className={`absolute -top-1 -right-1 bg-quaternary text-white text-xs font-bold rounded-full h-5 flex items-center justify-center ${
                    notificationCount > 99 ? 'min-w-5 px-1' : 'w-5'
                  }`}
                >
                  {notificationCount > 99 ? '99+' : notificationCount.toString().padStart(2, '0')}
                </span>
              )}
            </button>
            {notificationDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[420px] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-secondary">Notifications</h3>
                  {notificationCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-xs text-button-primary hover:underline cursor-pointer"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                <NavbarNotificationList
                  notifications={notifications}
                  locations={locations}
                  loadingInitial={notifLoadingInitial}
                  loadingMore={notifLoadingMore}
                  hasMore={notificationListHasMore}
                  infiniteScrollActive={isLgUp}
                  onLoadMore={loadMoreNotifications}
                  onNotificationClick={handleNotificationClick}
                />
              </div>
            )}
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="relative" ref={userRef}>
            <button
              type="button"
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-button-primary flex items-center justify-center text-white text-sm font-semibold">
                {getUserInitials()}
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-primary">{getUserDisplayName()}</div>
                <div className="text-xs text-gray-500">({getUserRole()})</div>
              </div>
              <ArrowDownIcon className="w-3 h-3" />
            </button>
            {userDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="py-2">
                  <button type="button" className="w-full text-left px-4 py-2 text-sm text-primary hover:bg-gray-50 transition-colors cursor-pointer">Profile</button>
                  <button type="button" className="w-full text-left px-4 py-2 text-sm text-primary hover:bg-gray-50 transition-colors cursor-pointer">Settings</button>
                  <div className="border-t border-gray-200 my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setUserDropdownOpen(false);
                      void logout();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile: Hamburger to open right-section menu */}
        <div className="lg:hidden flex-shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? (
              <CloseIcon className="w-6 h-6 text-primary" />
            ) : (
              <HamburgerIcon className="w-6 h-6 text-primary" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu: User profile card + action buttons (reference style, all centered) */}
      <div
        className={`lg:hidden transition-all duration-300 ease-in-out ${mobileMenuOpen ? 'max-h-[80vh] opacity-100 overflow-visible' : 'max-h-0 opacity-0 overflow-hidden'}`}
      >
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-card-background flex flex-col items-center gap-3 w-full relative z-10">
          {/* User profile card: light grey background, avatar + name + orange bell centered */}
          <div className="relative flex items-center justify-center gap-3 w-full max-w-sm px-4 py-3 bg-button-secondary rounded-xl">
            <div className="w-12 h-12 rounded-full bg-button-primary flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
              {getUserInitials()}
            </div>
            <div className="min-w-0 text-center">
              <div className="text-sm font-medium text-primary truncate">{getUserDisplayName()}</div>
              <div className="text-xs text-gray-500 truncate">({getUserRole()})</div>
            </div>
            <div className="relative flex-shrink-0" ref={notificationMobileRef}>
              <button
                type="button"
                onClick={() => setNotificationDropdownOpen(!notificationDropdownOpen)}
                className="relative p-2 hover:opacity-80 rounded-lg transition-opacity cursor-pointer"
              >
                <NotificationIcon className="w-5 h-5 text-quaternary" />
                {notificationCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-quaternary text-white text-xs font-bold leading-none rounded-full min-h-[18px] min-w-[18px] w-max px-1 flex items-center justify-center">
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </span>
                )}
              </button>
              {notificationDropdownOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-lg z-[200] max-h-80 flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-secondary">Notifications</h3>
                    {notificationCount > 0 && (
                      <button type="button" onClick={handleMarkAllRead} className="text-xs text-button-primary hover:underline cursor-pointer">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <NavbarNotificationList
                    notifications={notifications}
                    locations={locations}
                    loadingInitial={notifLoadingInitial}
                    loadingMore={notifLoadingMore}
                    hasMore={notificationListHasMore}
                    infiniteScrollActive={!isLgUp && mobileMenuOpen}
                    onLoadMore={loadMoreNotifications}
                    dense
                    onNotificationClick={handleNotificationClick}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Action buttons: centered, light border */}
          <button
            type="button"
            onClick={closeMobileMenu}
            className="w-full max-w-sm flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-primary hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Profile
          </button>
          <button
            type="button"
            onClick={closeMobileMenu}
            className="w-full max-w-sm flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-primary hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => {
              closeMobileMenu();
              void logout();
            }}
            className="w-full max-w-sm flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-primary hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <LogoutIcon className="w-5 h-5 flex-shrink-0 text-primary" />
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};
