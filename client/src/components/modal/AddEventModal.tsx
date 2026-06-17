import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isValid, parse } from 'date-fns';
import toast from 'react-hot-toast';
import { AnalogDatePickerField } from '../common/AnalogDatePickerField';
import { Dropdown, type DropdownOption } from '../common/Dropdown';
import { QuarterHourTimeSelect } from '../common/QuarterHourTimeSelect';
import { Spinner } from '../common/Spinner';
import { calendarService } from '../../services/calendar.service';
import type { CalendarEventTypeDto, IntegratedGoogleCalendarDto } from '../../types/calendar.types';
import type { LocationListItem } from '../../types';
import {
  combineDateTimeInTimezone,
  computeAddEventModalRangeAdjustmentsOnOpen,
  defaultEventRange,
  quarterHoursOnOrAfterNowOnWallDate,
  wallYmdMax,
  zonedWallTodayYmd,
} from '../../utils/addEventModalDateTime';
import { QUARTER_HOUR_HH_MM } from '../../utils/quarterHourTimeOptions';

export interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  locations: LocationListItem[];
  fallbackTimezone?: string;
  onCreated?: () => void;
}

export const AddEventModal = ({
  isOpen,
  onClose,
  locations,
  fallbackTimezone,
  onCreated,
}: AddEventModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pickerPopperContainer, setPickerPopperContainer] = useState<HTMLElement | null>(null);
  const [pickerModalPanel, setPickerModalPanel] = useState<HTMLElement | null>(null);
  const [pickerPaperWidth, setPickerPaperWidth] = useState(400);
  const [types, setTypes] = useState<CalendarEventTypeDto[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventTypeId, setEventTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [integrations, setIntegrations] = useState<IntegratedGoogleCalendarDto[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [googleCalendarId, setGoogleCalendarId] = useState('');
  const [eventLocationId, setEventLocationId] = useState('');

  const showLocationPicker = locations.length > 1;
  const locationOptions = useMemo(
    () => locations.map((loc) => ({ value: loc._id, label: loc.storeName })),
    [locations],
  );
  const activeLocation = useMemo(
    () => locations.find((loc) => loc._id === eventLocationId) ?? null,
    [eventLocationId, locations],
  );
  const effectiveLocationId = activeLocation?._id ?? (locations.length === 1 ? locations[0]?._id : undefined);
  const locationTimezone =
    activeLocation?.timezone?.trim() ||
    (locations.length === 1 ? locations[0]?.timezone?.trim() : undefined) ||
    fallbackTimezone?.trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  const setDialogEl = (el: HTMLDialogElement | null) => {
    dialogRef.current = el;
    setPickerPopperContainer(el);
  };

  useEffect(() => {
    if (!isOpen || !pickerModalPanel) return;
    const el = pickerModalPanel;
    const updateWidth = () => setPickerPaperWidth(el.getBoundingClientRect().width);
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, pickerModalPanel]);

  useEffect(() => {
    if (!isOpen) return;
    setEventLocationId(locations.length === 1 ? (locations[0]?._id ?? '') : '');
    const r = defaultEventRange(locationTimezone);
    setStartDate(r.startDate);
    setStartTime(r.startTime);
    setEndDate(r.endDate);
    setEndTime(r.endTime);
    setTitle('');
    setDescription('');
    setEventTypeId('');
    setTypesLoading(true);
    setIntegrationsLoading(true);
    calendarService
      .listEventTypesActive()
      .then((t) => {
        setTypes(t);
        if (t[0]) setEventTypeId(t[0]._id);
      })
      .catch(() => {
        toast.error('Failed to load event types.');
        setTypes([]);
      })
      .finally(() => setTypesLoading(false));
    calendarService
      .listGoogleCalendarIntegrations()
      .then((list) => {
        setIntegrations(list);
        if (list.length >= 1) setGoogleCalendarId(list[0]!.googleCalendarId);
        else setGoogleCalendarId('');
      })
      .catch(() => {
        setIntegrations([]);
        setGoogleCalendarId('');
      })
      .finally(() => setIntegrationsLoading(false));
  }, [isOpen, locationTimezone, locations]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  const todayWallYmd = useMemo(() => zonedWallTodayYmd(locationTimezone), [locationTimezone]);

  const minStartDateForPicker = useMemo(() => {
    const d = parse(todayWallYmd, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : undefined;
  }, [todayWallYmd]);

  const endMinWallYmd = useMemo(
    () => wallYmdMax(startDate.trim(), todayWallYmd),
    [startDate, todayWallYmd],
  );

  const parsedEndMinDate = useMemo(() => {
    const d = parse(endMinWallYmd, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : undefined;
  }, [endMinWallYmd]);

  const startTimeNotBeforeNowValues = useMemo((): readonly string[] | undefined => {
    const sd = startDate.trim();
    if (!sd || sd !== todayWallYmd) return undefined;
    return quarterHoursOnOrAfterNowOnWallDate(sd, locationTimezone);
  }, [startDate, todayWallYmd, locationTimezone]);

  const endTimeAllowedValues = useMemo((): readonly string[] | undefined => {
    const sd = startDate.trim();
    const ed = endDate.trim();
    if (!sd || !ed) return undefined;

    let fromStartSameDay: string[] | undefined;
    if (sd === ed && startTime.trim()) {
      fromStartSameDay = QUARTER_HOUR_HH_MM.filter((hm) => hm >= startTime);
    }

    if (ed === todayWallYmd) {
      const pastOk = quarterHoursOnOrAfterNowOnWallDate(ed, locationTimezone);
      if (fromStartSameDay == null) {
        return pastOk.length > 0 ? pastOk : undefined;
      }
      const ok = new Set(pastOk);
      const inter = fromStartSameDay.filter((hm) => ok.has(hm));
      return inter.length > 0 ? inter : undefined;
    }

    return fromStartSameDay;
  }, [startDate, endDate, startTime, todayWallYmd, locationTimezone]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const adj = computeAddEventModalRangeAdjustmentsOnOpen({
      timeZone: locationTimezone,
      startDate,
      startTime,
      endDate,
      endTime,
    });
    if (adj == null) return;

    if (adj.startDate != null) setStartDate(adj.startDate);
    if (adj.startTime != null) setStartTime(adj.startTime);
    if (adj.endDate != null) setEndDate(adj.endDate);
    if (adj.endTime != null) setEndTime(adj.endTime);
  }, [isOpen, locationTimezone, startDate, endDate, startTime, endTime]);

  const eventTypeOptions = useMemo(
    () => types.map((t) => ({ value: t._id, label: t.name })),
    [types],
  );

  const eventTypePlaceholder = useMemo(() => {
    if (typesLoading) return 'Loading...';
    if (types.length === 0) return 'No event types';
    return 'Select event type';
  }, [typesLoading, types.length]);

  const calendarDropdownOptions = useMemo((): DropdownOption[] => {
    return integrations.map((c) => ({
      value: c.googleCalendarId,
      label: c.name,
    }));
  }, [integrations]);

  const calendarPickerBlock = useMemo(() => {
    if (integrationsLoading) {
      return (
        <p className="text-xs text-secondary flex items-center gap-2">
          <Spinner size="sm" className="text-button-primary shrink-0" />
          Loading calendars…
        </p>
      );
    }
    if (integrations.length === 0) {
      return (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 leading-relaxed">
          No Google calendars are integrated. Add one on{' '}
          <span className="font-medium">Events &amp; Notifications</span> settings, then try again.
        </p>
      );
    }
    if (integrations.length === 1) {
      const c = integrations[0]!;
      return (
        <p className="text-xs text-secondary leading-relaxed">
          This event will be added to:{' '}
          <span className="font-medium text-primary break-all">{c.name}</span>
        </p>
      );
    }
    return (
      <Dropdown
        options={calendarDropdownOptions}
        value={googleCalendarId}
        onChange={setGoogleCalendarId}
        placeholder="Select calendar"
        aria-label="Select Google calendar"
        aria-labelledby="add-event-calendar-label"
        className="w-full"
        allowEmpty={false}
        disabled={integrations.length === 0}
      />
    );
  }, [
    integrationsLoading,
    integrations,
    calendarDropdownOptions,
    googleCalendarId,
  ]);

  const selectedEventTypeName = useMemo(
    () => types.find((t) => t._id === eventTypeId)?.name,
    [types, eventTypeId],
  );

  let eventTypeTriggerContent: ReactNode;
  if (typesLoading) {
    eventTypeTriggerContent = (
      <>
        <Spinner size="sm" className="flex-shrink-0 text-button-primary" />
        <span className="text-xs md:text-sm 2xl:text-base text-primary">Loading...</span>
      </>
    );
  } else if (types.length === 0) {
    eventTypeTriggerContent = (
      <span className="text-xs md:text-sm 2xl:text-base text-primary">No event types</span>
    );
  } else if (selectedEventTypeName) {
    eventTypeTriggerContent = (
      <span className="text-xs md:text-sm 2xl:text-base text-primary truncate" title={selectedEventTypeName}>
        {selectedEventTypeName}
      </span>
    );
  } else {
    eventTypeTriggerContent = (
      <span className="text-xs md:text-sm 2xl:text-base text-secondary">Select event type</span>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (showLocationPicker && !eventLocationId) {
      toast.error('Please select a location for this event.');
      return;
    }
    const locationId = effectiveLocationId;
    if (!locationId) {
      toast.error('Please select a location for this event.');
      return;
    }
    if (!title.trim()) {
      toast.error('Title is required.');
      return;
    }
    if (!eventTypeId) {
      toast.error('Select an event type.');
      return;
    }
    if (!googleCalendarId.trim()) {
      toast.error('Add a Google calendar under Events & Notifications settings first.');
      return;
    }
    const start = combineDateTimeInTimezone(startDate, startTime, locationTimezone);
    const end = combineDateTimeInTimezone(endDate, endTime, locationTimezone);
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error('Enter a valid date and time for start and end.');
      return;
    }
    if (end.getTime() < start.getTime()) {
      toast.error('End time cannot be before start time.');
      return;
    }
    const nowMs = Date.now();
    if (start.getTime() < nowMs) {
      toast.error('Start cannot be before the current date and time.');
      return;
    }
    if (end.getTime() < nowMs) {
      toast.error('End cannot be before the current date and time.');
      return;
    }
    setSaving(true);
    try {
      await calendarService.createEvent({
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        start,
        end,
        eventTypeId,
        locationId,
        googleCalendarId: googleCalendarId.trim(),
      });
      toast.success('Event added.');
      onCreated?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create event.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const initialLoading = typesLoading || integrationsLoading;

  return createPortal(
    <dialog
      ref={setDialogEl}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="add-event-modal-title"
      onClose={onClose}
    >
      <div className="relative w-full max-w-md">
        <button
          type="button"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div
          ref={setPickerModalPanel}
          className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden"
        >
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3.5 flex-shrink-0">
            <h2 id="add-event-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Add Event
            </h2>
          </div>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-7 px-6 py-6 border-x border-gray-200 overflow-y-auto"
          >
            {initialLoading ? (
              <div className="flex-1 min-h-[320px] grid place-items-center">
                <div className="flex flex-col items-center gap-3 text-primary">
                  <Spinner size="xl" className="text-button-primary" />
                  <p className="text-sm text-secondary">Loading…</p>
                </div>
              </div>
            ) : (
              <>
                {showLocationPicker ? (
                  <div>
                    <span className="block text-xs font-semibold text-primary mb-2">
                      Location <span className="text-red-600">*</span>
                    </span>
                    <p className="text-xs text-secondary mb-2 leading-relaxed">
                      The event will be created for the selected location only.
                    </p>
                    <Dropdown
                      options={locationOptions}
                      value={eventLocationId}
                      onChange={setEventLocationId}
                      placeholder="Select location"
                      aria-label="Event location"
                      className="w-full"
                      allowEmpty
                    />
                  </div>
                ) : null}
                {effectiveLocationId ? (
                  <p className="text-xs text-secondary leading-relaxed">
                    {locationTimezone ? (
                      <>
                        Date and time use this location&apos;s timezone:{' '}
                        <span className="font-medium text-primary">{locationTimezone}</span>
                      </>
                    ) : (
                      <>
                        This location has no timezone set. Times use your browser&apos;s local timezone until a timezone is
                        saved on the location.
                      </>
                    )}
                  </p>
                ) : showLocationPicker ? (
                  <p className="text-xs text-secondary leading-relaxed">
                    Select a location to set the event timezone and save.
                  </p>
                ) : null}
                <div>
                  <label htmlFor="add-event-title" className="block text-xs font-semibold text-primary mb-2">
                    Title
                  </label>
                  <input
                    id="add-event-title"
                    type="text"
                    value={title}
                    onChange={(ev) => setTitle(ev.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Event title"
                    maxLength={500}
                  />
                </div>
                <div>
                  <span id="add-event-type-label" className="block text-xs font-semibold text-primary mb-2">
                    Event type
                  </span>
                  <Dropdown
                    options={eventTypeOptions}
                    value={eventTypeId}
                    onChange={setEventTypeId}
                    placeholder={eventTypePlaceholder}
                    aria-label="Select event type"
                    aria-labelledby="add-event-type-label"
                    className="w-full"
                    allowEmpty={false}
                    disabled={typesLoading || types.length === 0}
                    triggerLabel={eventTypeTriggerContent}
                  />
                </div>
                <div>
                  <span id="add-event-calendar-label" className="block text-xs font-semibold text-primary mb-2">
                    Google calendar
                  </span>
                  {calendarPickerBlock}
                </div>
                <fieldset className="border-0 p-0 m-0 min-w-0">
                  <legend className="block text-xs font-semibold text-primary mb-3 px-0">Start</legend>
                  <div className="grid grid-cols-2 gap-4 min-w-0">
                    <div className="min-w-0">
                      <span id="add-event-start-date-label" className="block text-xs text-secondary mb-1.5">
                        Date
                      </span>
                      <AnalogDatePickerField
                        value={startDate}
                        onChange={setStartDate}
                        pickerPaperWidth={pickerPaperWidth}
                        pickerPopperContainer={pickerPopperContainer}
                        pickerModalPanel={pickerModalPanel}
                        labelledBy="add-event-start-date-label"
                        minDate={minStartDateForPicker}
                      />
                    </div>
                    <div className="min-w-0">
                      <span id="add-event-start-time-label" className="block text-xs text-secondary mb-1.5">
                        Time
                      </span>
                      <QuarterHourTimeSelect
                        value={startTime}
                        onChange={setStartTime}
                        fallbackTime="09:00"
                        labelledBy="add-event-start-time-label"
                        allowedValues={startTimeNotBeforeNowValues}
                      />
                    </div>
                  </div>
                </fieldset>
                <fieldset className="border-0 p-0 m-0 min-w-0">
                  <legend className="block text-xs font-semibold text-primary mb-3 px-0">End</legend>
                  <div className="grid grid-cols-2 gap-4 min-w-0">
                    <div className="min-w-0">
                      <span id="add-event-end-date-label" className="block text-xs text-secondary mb-1.5">
                        Date
                      </span>
                      <AnalogDatePickerField
                        value={endDate}
                        onChange={setEndDate}
                        pickerPaperWidth={pickerPaperWidth}
                        pickerPopperContainer={pickerPopperContainer}
                        pickerModalPanel={pickerModalPanel}
                        labelledBy="add-event-end-date-label"
                        minDate={parsedEndMinDate}
                      />
                    </div>
                    <div className="min-w-0">
                      <span id="add-event-end-time-label" className="block text-xs text-secondary mb-1.5">
                        Time
                      </span>
                      <QuarterHourTimeSelect
                        value={endTime}
                        onChange={setEndTime}
                        fallbackTime="09:00"
                        labelledBy="add-event-end-time-label"
                        allowedValues={endTimeAllowedValues}
                      />
                    </div>
                  </div>
                </fieldset>
                <div>
                  <label htmlFor="add-event-desc" className="block text-xs font-semibold text-primary mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    id="add-event-desc"
                    value={description}
                    onChange={(ev) => setDescription(ev.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y min-h-[80px]"
                    placeholder="Notes for your team"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-5 mt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 text-primary hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      saving ||
                      !effectiveLocationId ||
                      typesLoading ||
                      integrationsLoading ||
                      integrations.length === 0 ||
                      !googleCalendarId.trim()
                    }
                    className="px-4 py-2 bg-button-primary text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save event'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};
