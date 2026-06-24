import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { markNotificationRead } from '../store/slices/notification.slice';
import { clearToSingleLocation } from '../store/slices/location.slice';
import { notificationService } from '../services/notification.service';
import {
  NOTIFICATION_LOCATION_QUERY_PARAM,
  NOTIFICATION_READ_QUERY_PARAM,
} from '../utils/notificationNavigation';
import {
  claimNotificationLocationFromUrl,
  claimUrlNotificationMarkRead,
} from '../utils/notificationReadHelpers';
import type { RootState } from '../store/store';

/**
 * Applies notification deep-link side effects from URL query params (mark read, switch location).
 * Used when opening notification links in a new tab where navbar onClick handlers do not run.
 */
export function useMarkNotificationReadFromUrl(): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useDispatch();
  const locationById = useSelector((state: RootState) => state.location.locationById);
  const listHydrated = useSelector((state: RootState) => state.location.listHydrated);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let dirty = false;

    const notificationId = next.get(NOTIFICATION_READ_QUERY_PARAM)?.trim();
    if (notificationId && claimUrlNotificationMarkRead(notificationId)) {
      dispatch(markNotificationRead(notificationId));
      notificationService.markAsRead(notificationId).catch(() => {});
      next.delete(NOTIFICATION_READ_QUERY_PARAM);
      dirty = true;
    }

    const locationId = next.get(NOTIFICATION_LOCATION_QUERY_PARAM)?.trim();
    if (locationId && listHydrated) {
      const loc = locationById[locationId];
      if (loc && claimNotificationLocationFromUrl(locationId)) {
        dispatch(clearToSingleLocation(loc));
        next.delete(NOTIFICATION_LOCATION_QUERY_PARAM);
        dirty = true;
      }
    }

    if (dirty) {
      setSearchParams(next, { replace: true });
    }
  }, [dispatch, listHydrated, locationById, searchParams, setSearchParams]);
}
