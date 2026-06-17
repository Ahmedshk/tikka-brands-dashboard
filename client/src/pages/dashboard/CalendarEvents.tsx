import { useState, useEffect, useCallback, useMemo } from 'react';
import type { View } from 'react-big-calendar';
import { useSelector } from 'react-redux';
import { addMonths, endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { Layout } from '../../components/common/Layout';
import { Spinner } from '../../components/common/Spinner';
import {
  buildUpcomingEventRows,
  CalendarCard,
  UpcomingEventsCard,
  type CalendarEventItem,
  type UpcomingEventRow,
} from '../../components/CalendarEvents';
import { AddEventModal } from '../../components/modal/AddEventModal';
import { EditEventModal } from '../../components/modal/EditEventModal';
import { ConfirmDialog } from '../../components/modal/ConfirmDialog';
import CalendarEventsIcon from '@assets/icons/calendar_and_events.svg?react';
import {
  selectCurrentLocation,
  selectIsMultiLocationView,
  selectLocationApiParams,
  selectSelectedLocations,
} from '../../store/locationSelectors';
import { hasLocationSelection } from '../../utils/locationSelectionHelpers';
import { calendarService } from '../../services/calendar.service';
import type { CalendarEventDto, CalendarEventTypeDto } from '../../types/calendar.types';
import { colorHexToCalendarBackground } from '../../utils/calendarColors';
import toast from 'react-hot-toast';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';

const PAGE_ID = 'calendar-events';

function visibleRange(anchor: Date): { timeMin: Date; timeMax: Date } {
  const timeMin = startOfMonth(subMonths(anchor, 1));
  const timeMax = endOfMonth(addMonths(anchor, 2));
  return { timeMin, timeMax };
}

function dtoToCalendarItems(
  rows: CalendarEventDto[],
  typeById: Map<string, CalendarEventTypeDto>,
): CalendarEventItem[] {
  return rows.map((r) => {
    const t = typeById.get(r.eventTypeId);
    return {
      id: r._id,
      start: new Date(r.start),
      end: new Date(r.end),
      title: r.title,
      color: t ? colorHexToCalendarBackground(t.colorHex) : undefined,
    };
  });
}

export const CalendarEvents = () => {
  const locationApiParams = useSelector(selectLocationApiParams);
  const isMultiLocationView = useSelector(selectIsMultiLocationView);
  const currentLocation = useSelector(selectCurrentLocation);
  const selectedLocations = useSelector(selectSelectedLocations);
  const hasLocationScope = hasLocationSelection(locationApiParams);
  const canAddEvents = useCanAccessComponent(PAGE_ID, 'add-events');
  const canCalendar = useCanAccessComponent(PAGE_ID, 'calendar');
  const canUpcomingEvents = useCanAccessComponent(PAGE_ID, 'upcoming-events');
  const browserDefaultTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const hasCalendarScope =
    hasLocationScope && (canCalendar || canUpcomingEvents);
  const calendarTimezone =
    currentLocation?.timezone?.trim() || browserDefaultTz;
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentView, setCurrentView] = useState<View>('month');
  const [selectedDate] = useState<Date | null>(null);
  const [addEventModalOpen, setAddEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventDto | null>(null);
  const [deletingRow, setDeletingRow] = useState<UpcomingEventRow | null>(null);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [eventTypes, setEventTypes] = useState<CalendarEventTypeDto[]>([]);
  const [loading, setLoading] = useState(true);

  const typeById = useMemo(() => {
    const m = new Map<string, CalendarEventTypeDto>();
    for (const t of eventTypes) m.set(t._id, t);
    return m;
  }, [eventTypes]);

  const calendarItems = useMemo(
    () => dtoToCalendarItems(events, typeById),
    [events, typeById],
  );

  const upcomingRows = useMemo(() => buildUpcomingEventRows(events), [events]);

  const loadData = useCallback(async () => {
    if (!hasLocationScope || (!canCalendar && !canUpcomingEvents)) {
      setEvents([]);
      setEventTypes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { timeMin, timeMax } = visibleRange(currentDate);
    try {
      const [typeList, eventList] = await Promise.all([
        calendarService.listEventTypesActive(),
        calendarService.listEvents(locationApiParams, timeMin, timeMax),
      ]);
      setEventTypes(typeList);
      setEvents(eventList);
    } catch {
      setEvents([]);
      toast.error('Failed to load calendar.');
    } finally {
      setLoading(false);
    }
  }, [locationApiParams, hasLocationScope, currentDate, canCalendar, canUpcomingEvents]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!hasLocationScope || (!canCalendar && !canUpcomingEvents)) return;
    const { timeMin, timeMax } = visibleRange(currentDate);
    calendarService.syncEvents(timeMin, timeMax).catch(() => {});
  }, [locationApiParams, hasLocationScope, currentDate, canCalendar, canUpcomingEvents]);

  const handleNavigate = (date: Date) => {
    setCurrentDate(date);
  };

  const handleSelectSlot = ({ start }: { start: Date; end: Date; slots: Date[] }) => {
    if (currentView === 'month') {
      setCurrentDate(start);
      setCurrentView('day');
    }
  };

  const handleDrillDown = (date: Date) => {
    setCurrentDate(date);
    setCurrentView('day');
  };

  const handleSelectEvent = (event: CalendarEventItem) => {
    if (currentView === 'month') {
      setCurrentDate(event.start);
      setCurrentView('day');
    }
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <CalendarEventsIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Calendar & Events
          </h2>
          {canAddEvents && selectedLocations.length > 0 ? (
            <button
              type="button"
              onClick={() => setAddEventModalOpen(true)}
              className="self-start sm:self-center px-4 py-2 bg-button-primary text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              + Add Events
            </button>
          ) : null}
        </div>

        {!hasCalendarScope && (
          <p className="text-sm text-secondary">Select a location to view and manage events.</p>
        )}
        {hasCalendarScope && loading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}
        {hasCalendarScope && !loading && (
          <div className="space-y-6">
            {canCalendar ? (
              <CalendarCard
                events={calendarItems}
                date={currentDate}
                view={currentView}
                onView={setCurrentView}
                selectedDate={selectedDate}
                onNavigate={handleNavigate}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectEvent}
                onDrillDown={handleDrillDown}
              />
            ) : null}
            {canUpcomingEvents ? (
              <UpcomingEventsCard
                rows={upcomingRows}
                pageSize={5}
                showLocationLabel={isMultiLocationView}
                onEdit={(row) => setEditingEvent(row.event)}
                onDelete={(row) => setDeletingRow(row)}
              />
            ) : null}
          </div>
        )}
      </div>

      <AddEventModal
        isOpen={canAddEvents && addEventModalOpen}
        onClose={() => setAddEventModalOpen(false)}
        locations={selectedLocations}
        fallbackTimezone={browserDefaultTz}
        onCreated={loadData}
      />
      <EditEventModal
        isOpen={editingEvent != null}
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        locationTimezone={calendarTimezone}
        onUpdated={loadData}
      />
      <ConfirmDialog
        isOpen={deletingRow != null}
        onClose={() => setDeletingRow(null)}
        title="Delete event"
        message={
          deletingRow
            ? `Delete “${deletingRow.eventName}”? This removes the event from Google Calendar and the dashboard. Scheduled notifications for this event will be cancelled.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={deletingEvent}
        onConfirm={async () => {
          if (!deletingRow) return;
          setDeletingEvent(true);
          try {
            await calendarService.deleteEvent(deletingRow.event._id);
            toast.success('Event deleted.');
            setDeletingRow(null);
            await loadData();
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete event.';
            toast.error(msg);
            throw err;
          } finally {
            setDeletingEvent(false);
          }
        }}
      />
    </Layout>
  );
};
