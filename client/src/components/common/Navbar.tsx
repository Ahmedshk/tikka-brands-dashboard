import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store/store';
import { setCurrentLocation, getStoredLocationId } from '../../store/slices/location.slice';
import { locationService } from '../../services/location.service';
import { useAuth } from '../../hooks/useAuth';
import type { Location } from '../../types';
import { Spinner } from './Spinner';
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

const LOCATION_MANAGEMENT_PATH = '/dashboard/location-management';

export const Navbar = () => {
  const { pathname } = useLocation();
  const dispatch = useDispatch();
  const { logout } = useAuth();
  const user = useSelector((state: RootState) => state.auth.user);
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const [locations, setLocations] = useState<Location[]>([]);
  const hideLocationSelector = pathname === LOCATION_MANAGEMENT_PATH;
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const notificationCount = 2; // Placeholder count

  // Fetch locations and sync current location from storage or first location
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await locationService.getAll();
        if (cancelled) return;
        setLocations(data);
        const storedId = getStoredLocationId();
        const match = data.find((loc) => loc._id === storedId);
        if (match) {
          dispatch(setCurrentLocation(match));
        } else if (data.length > 0 && !currentLocation) {
          dispatch(setCurrentLocation(data[0] ?? null));
        }
      } catch {
        if (!cancelled) setLocations([]);
      } finally {
        if (!cancelled) setLocationsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  // Keep current location in sync if it was removed from list (e.g. deleted elsewhere)
  useEffect(() => {
    if (!currentLocation || locations.length === 0) return;
    const stillExists = locations.some((loc) => loc._id === currentLocation._id);
    if (!stillExists) dispatch(setCurrentLocation(locations[0] ?? null));
  }, [locations, currentLocation, dispatch]);

  const locationRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const notificationMobileRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (locationRef.current && !locationRef.current.contains(target)) {
        setLocationDropdownOpen(false);
      }
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

  return (
    <nav className="relative z-20 bg-card-background border-b border-gray-200 min-h-[72px] flex flex-col" ref={mobileMenuRef}>
      <div className="flex items-center justify-between gap-2 px-4 sm:px-6 lg:px-8 h-[72px] shrink-0">
        {/* Spacer when location selector is hidden (e.g. Location Management) so notifications/profile stay right */}
        {hideLocationSelector && <div className="min-w-0 flex-1" />}
        {/* Location Selector - hidden on Location Management so updates apply to the store being edited */}
        {!hideLocationSelector && (
          <div className="relative min-w-0 flex-1 w-full lg:flex-initial lg:max-w-md xl:max-w-xl" ref={locationRef}>
            <button
              type="button"
              onClick={async () => {
                if (!locationDropdownOpen) {
                  try {
                    const data = await locationService.getAll();
                    setLocations(data);
                    const stillExists = currentLocation && data.some((loc) => loc._id === currentLocation._id);
                    if (currentLocation && !stillExists && data.length > 0) dispatch(setCurrentLocation(data[0] ?? null));
                  } catch {
                    // keep existing locations
                  }
                }
                setLocationDropdownOpen(!locationDropdownOpen);
              }}
              disabled={locationsLoading}
              className="flex items-center gap-2 w-full px-3 sm:px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-70"
            >
              <LocationIcon className="w-4 h-4 md:w-4.5 md:h-4.5 2xl:w-5 2xl:h-5 flex-shrink-0" />
              <span className="flex-1 min-w-0 flex items-center gap-2 text-xs md:text-sm 2xl:text-base text-primary whitespace-nowrap truncate text-left" title={currentLocation ? `${currentLocation.storeName} – ${currentLocation.address}` : undefined}>
                {locationsLoading && <Spinner size="sm" className="flex-shrink-0 text-button-primary" />}
                {(() => {
                  if (locationsLoading) return 'Loading...';
                  if (currentLocation) return currentLocation.storeName;
                  if (locations.length === 0) return 'No locations';
                  return 'Select location';
                })()}
              </span>
              <ArrowDownIcon className="w-3 h-3 flex-shrink-0" />
            </button>

            {locationDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-full min-w-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="py-2 max-h-64 overflow-y-auto">
                  {locations.length === 0 ? (
                    <p className="px-4 py-2 text-sm text-gray-500">No locations. Add one in Location Management.</p>
                  ) : (
                    locations.map((loc) => (
                      <button
                        key={loc._id}
                        type="button"
                        onClick={() => {
                          dispatch(setCurrentLocation(loc));
                          setLocationDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs md:text-sm 2xl:text-base text-primary hover:bg-gray-50 transition-colors ${currentLocation?._id === loc._id ? 'bg-button-secondary' : ''}`}
                      >
                        <span className="font-medium block truncate">{loc.storeName}</span>
                        <span className="text-[10px] md:text-xs 2xl:text-sm text-gray-500 truncate block">{loc.address}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
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
                <span className="absolute -top-1 -right-1 bg-quaternary text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {notificationCount.toString().padStart(2, '0')}
                </span>
              )}
            </button>
            {notificationDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-secondary mb-2">Notifications</h3>
                  <p className="text-sm text-primary">No new notifications</p>
                </div>
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
                  <span className="absolute -top-0.5 -right-0.5 bg-quaternary text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {notificationCount}
                  </span>
                )}
              </button>
              {notificationDropdownOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-lg z-[200]">
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-secondary mb-2">Notifications</h3>
                    <p className="text-sm text-primary">No new notifications</p>
                  </div>
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
