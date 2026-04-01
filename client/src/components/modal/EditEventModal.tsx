import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { addDays, format, isValid, parse } from 'date-fns';
import toast from 'react-hot-toast';
import { AnalogDatePickerField } from '../common/AnalogDatePickerField';
import { Dropdown } from '../common/Dropdown';
import { QuarterHourTimeSelect } from '../common/QuarterHourTimeSelect';
import { Spinner } from '../common/Spinner';
import { ConfirmDialog } from './ConfirmDialog';
import { calendarService } from '../../services/calendar.service';
import type { CalendarEventDto, CalendarEventTypeDto } from '../../types/calendar.types';
import {
  combineDateTimeInTimezone,
  defaultEventRange,
  nextWallYmd,
  quarterHoursOnOrAfterNowOnWallDate,
  splitInstantToLocationWallForForm,
  wallYmdMax,
  zonedWallTodayYmd,
} from '../../utils/addEventModalDateTime';
import { QUARTER_HOUR_HH_MM } from '../../utils/quarterHourTimeOptions';

export interface EditEventModalProps {
  isOpen: boolean;
  event: CalendarEventDto | null;
  onClose: () => void;
  locationTimezone?: string;
  onUpdated?: () => void;
}

export const EditEventModal = ({
  isOpen,
  event,
  onClose,
  locationTimezone,
  onUpdated,
}: EditEventModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pickerPopperContainer, setPickerPopperContainer] = useState<HTMLElement | null>(null);
  const [pickerModalPanel, setPickerModalPanel] = useState<HTMLElement | null>(null);
  const [pickerPaperWidth, setPickerPaperWidth] = useState(400);
  const [types, setTypes] = useState<CalendarEventTypeDto[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventTypeId, setEventTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  const effectiveTz = event?.timeZone?.trim() || locationTimezone;

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
    if (!isOpen || !event) return;
    setUpdateConfirmOpen(false);
    setTitle(event.title ?? '');
    setDescription(event.description ?? '');
    setEventTypeId(event.eventTypeId ?? '');
    const startParts = splitInstantToLocationWallForForm(event.start, effectiveTz);
    const endParts = splitInstantToLocationWallForForm(event.end, effectiveTz);
    let sd = startParts.date;
    let st = startParts.time;
    let ed = endParts.date;
    let et = endParts.time;
    const sInst = combineDateTimeInTimezone(sd, st, effectiveTz);
    const eInst = combineDateTimeInTimezone(ed, et, effectiveTz);
    const now = new Date();
    if (
      sInst &&
      eInst &&
      (sInst.getTime() < now.getTime() || eInst.getTime() < now.getTime())
    ) {
      const r = defaultEventRange(effectiveTz);
      sd = r.startDate;
      st = r.startTime;
      ed = r.endDate;
      et = r.endTime;
    }
    setStartDate(sd);
    setStartTime(st);
    setEndDate(ed);
    setEndTime(et);
    setTypesLoading(true);
    calendarService
      .listEventTypesActive()
      .then((t) => {
        setTypes(t);
        if (event.eventTypeId && t.some((x) => x._id === event.eventTypeId)) {
          setEventTypeId(event.eventTypeId);
        } else if (t[0]) {
          setEventTypeId(t[0]._id);
        }
      })
      .catch(() => {
        toast.error('Failed to load event types.');
        setTypes([]);
      })
      .finally(() => setTypesLoading(false));
  }, [isOpen, event, effectiveTz]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !updateConfirmOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, updateConfirmOpen]);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  const todayWallYmd = useMemo(() => zonedWallTodayYmd(effectiveTz), [effectiveTz]);

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
    return quarterHoursOnOrAfterNowOnWallDate(sd, effectiveTz);
  }, [startDate, todayWallYmd, effectiveTz]);

  const endTimeAllowedValues = useMemo((): readonly string[] | undefined => {
    const sd = startDate.trim();
    const ed = endDate.trim();
    if (!sd || !ed) return undefined;

    let fromStartSameDay: string[] | undefined;
    if (sd === ed && startTime.trim()) {
      fromStartSameDay = QUARTER_HOUR_HH_MM.filter((hm) => hm >= startTime);
    }

    if (ed === todayWallYmd) {
      const pastOk = quarterHoursOnOrAfterNowOnWallDate(ed, effectiveTz);
      if (fromStartSameDay == null) {
        return pastOk.length > 0 ? pastOk : undefined;
      }
      const ok = new Set(pastOk);
      const inter = fromStartSameDay.filter((hm) => ok.has(hm));
      return inter.length > 0 ? inter : undefined;
    }

    return fromStartSameDay;
  }, [startDate, endDate, startTime, todayWallYmd, effectiveTz]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const tz = effectiveTz;
    const todayY = zonedWallTodayYmd(tz);
    const sd = startDate.trim();
    const ed = endDate.trim();

    if (sd) {
      const startSlots = quarterHoursOnOrAfterNowOnWallDate(sd, tz);
      if (sd === todayY && startSlots.length === 0) {
        setStartDate(nextWallYmd(todayY));
        setStartTime('00:00');
        return;
      }
      if (sd === todayY && startTime.trim() && startSlots.length > 0 && !startSlots.includes(startTime.trim())) {
        setStartTime(startSlots[0]!);
        return;
      }
    }

    if (!sd || !ed) return;
    if (ed < sd) {
      setEndDate(sd);
      return;
    }
    if (sd === ed && startTime.trim()) {
      let validEnd = QUARTER_HOUR_HH_MM.filter((hm) => hm >= startTime);
      if (ed === todayY) {
        const nowSlots = new Set(quarterHoursOnOrAfterNowOnWallDate(ed, tz));
        validEnd = validEnd.filter((hm) => nowSlots.has(hm));
      }
      if (validEnd.length === 0) {
        const p = parse(sd, 'yyyy-MM-dd', new Date());
        if (isValid(p)) {
          setEndDate(format(addDays(p, 1), 'yyyy-MM-dd'));
          setEndTime('00:00');
        }
        return;
      }
      if (endTime.trim() && !validEnd.includes(endTime)) {
        setEndTime(validEnd[0]!);
      }
    } else if (sd !== ed && ed === todayY) {
      const endSlots = quarterHoursOnOrAfterNowOnWallDate(ed, tz);
      if (endSlots.length === 0) {
        setEndDate(nextWallYmd(ed));
        setEndTime('00:00');
        return;
      }
      if (endTime.trim() && !endSlots.includes(endTime)) {
        setEndTime(endSlots[0]!);
      }
    }
  }, [isOpen, effectiveTz, startDate, endDate, startTime, endTime]);

  const eventTypeOptions = useMemo(
    () => types.map((t) => ({ value: t._id, label: t.name })),
    [types],
  );

  const eventTypePlaceholder = useMemo(() => {
    if (typesLoading) return 'Loading...';
    if (types.length === 0) return 'No event types';
    return 'Select event type';
  }, [typesLoading, types.length]);

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

  const runUpdate = async (): Promise<void> => {
    if (!event) {
      throw new Error('Missing event');
    }
    if (!title.trim()) {
      toast.error('Title is required.');
      throw new Error('validation');
    }
    if (!eventTypeId) {
      toast.error('Select an event type.');
      throw new Error('validation');
    }
    const start = combineDateTimeInTimezone(startDate, startTime, effectiveTz);
    const end = combineDateTimeInTimezone(endDate, endTime, effectiveTz);
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error('Enter a valid date and time for start and end.');
      throw new Error('validation');
    }
    if (end.getTime() < start.getTime()) {
      toast.error('End time cannot be before start time.');
      throw new Error('validation');
    }
    const nowMs = Date.now();
    if (start.getTime() < nowMs) {
      toast.error('Start cannot be before the current date and time.');
      throw new Error('validation');
    }
    if (end.getTime() < nowMs) {
      toast.error('End cannot be before the current date and time.');
      throw new Error('validation');
    }
    setSaving(true);
    try {
      await calendarService.updateEvent(event._id, {
        title: title.trim(),
        description: description.trim(),
        start,
        end,
        eventTypeId,
      });
      toast.success('Event updated.');
      setUpdateConfirmOpen(false);
      onUpdated?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update event.';
      toast.error(msg);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
  };

  const handleConfirmUpdate = async (): Promise<void> => {
    await runUpdate();
  };

  const openUpdateConfirm = () => {
    if (!title.trim()) {
      toast.error('Title is required.');
      return;
    }
    if (!eventTypeId) {
      toast.error('Select an event type.');
      return;
    }
    const start = combineDateTimeInTimezone(startDate, startTime, effectiveTz);
    const end = combineDateTimeInTimezone(endDate, endTime, effectiveTz);
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
    setUpdateConfirmOpen(true);
  };

  if (!isOpen || !event) return null;

  return createPortal(
    <>
      <dialog
        ref={setDialogEl}
        className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
        aria-labelledby="edit-event-modal-title"
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
              <h2 id="edit-event-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
                Edit Event
              </h2>
            </div>
            <form
              onSubmit={handleFormSubmit}
              className="flex flex-col gap-7 px-6 py-6 border-x border-gray-200 overflow-y-auto"
            >
              <p className="text-xs text-secondary leading-relaxed">
                {effectiveTz ? (
                  <>
                    Date and time use this event&apos;s timezone:{' '}
                    <span className="font-medium text-primary">{effectiveTz}</span>
                  </>
                ) : (
                  <>
                    No timezone on this event; times use your browser&apos;s local timezone until saved with a location
                    timezone.
                  </>
                )}
              </p>
              <div>
                <label htmlFor="edit-event-title" className="block text-xs font-semibold text-primary mb-2">
                  Title
                </label>
                <input
                  id="edit-event-title"
                  type="text"
                  value={title}
                  onChange={(ev) => setTitle(ev.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Event title"
                  maxLength={500}
                />
              </div>
              <div>
                <span id="edit-event-type-label" className="block text-xs font-semibold text-primary mb-2">
                  Event type
                </span>
                <Dropdown
                  options={eventTypeOptions}
                  value={eventTypeId}
                  onChange={setEventTypeId}
                  placeholder={eventTypePlaceholder}
                  aria-label="Select event type"
                  aria-labelledby="edit-event-type-label"
                  className="w-full"
                  allowEmpty={false}
                  disabled={typesLoading || types.length === 0}
                  triggerLabel={eventTypeTriggerContent}
                />
              </div>
              <fieldset className="border-0 p-0 m-0 min-w-0">
                <legend className="block text-xs font-semibold text-primary mb-3 px-0">Start</legend>
                <div className="grid grid-cols-2 gap-4 min-w-0">
                  <div className="min-w-0">
                    <span id="edit-event-start-date-label" className="block text-xs text-secondary mb-1.5">
                      Date
                    </span>
                    <AnalogDatePickerField
                      value={startDate}
                      onChange={setStartDate}
                      pickerPaperWidth={pickerPaperWidth}
                      pickerPopperContainer={pickerPopperContainer}
                      pickerModalPanel={pickerModalPanel}
                      labelledBy="edit-event-start-date-label"
                      minDate={minStartDateForPicker}
                    />
                  </div>
                  <div className="min-w-0">
                    <span id="edit-event-start-time-label" className="block text-xs text-secondary mb-1.5">
                      Time
                    </span>
                    <QuarterHourTimeSelect
                      value={startTime}
                      onChange={setStartTime}
                      fallbackTime="09:00"
                      labelledBy="edit-event-start-time-label"
                      allowedValues={startTimeNotBeforeNowValues}
                    />
                  </div>
                </div>
              </fieldset>
              <fieldset className="border-0 p-0 m-0 min-w-0">
                <legend className="block text-xs font-semibold text-primary mb-3 px-0">End</legend>
                <div className="grid grid-cols-2 gap-4 min-w-0">
                  <div className="min-w-0">
                    <span id="edit-event-end-date-label" className="block text-xs text-secondary mb-1.5">
                      Date
                    </span>
                    <AnalogDatePickerField
                      value={endDate}
                      onChange={setEndDate}
                      pickerPaperWidth={pickerPaperWidth}
                      pickerPopperContainer={pickerPopperContainer}
                      pickerModalPanel={pickerModalPanel}
                      labelledBy="edit-event-end-date-label"
                      minDate={parsedEndMinDate}
                    />
                  </div>
                  <div className="min-w-0">
                    <span id="edit-event-end-time-label" className="block text-xs text-secondary mb-1.5">
                      Time
                    </span>
                    <QuarterHourTimeSelect
                      value={endTime}
                      onChange={setEndTime}
                      fallbackTime="09:00"
                      labelledBy="edit-event-end-time-label"
                      allowedValues={endTimeAllowedValues}
                    />
                  </div>
                </div>
              </fieldset>
              <div>
                <label htmlFor="edit-event-desc" className="block text-xs font-semibold text-primary mb-2">
                  Description (optional)
                </label>
                <textarea
                  id="edit-event-desc"
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
                  type="button"
                  onClick={openUpdateConfirm}
                  disabled={saving || typesLoading}
                  className="px-4 py-2 bg-button-primary text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      </dialog>
      <ConfirmDialog
        isOpen={updateConfirmOpen}
        onClose={() => setUpdateConfirmOpen(false)}
        title="Update event"
        message="Apply these changes? The calendar event will be updated in Google Calendar and notification schedules will be refreshed."
        confirmLabel="Update"
        cancelLabel="Cancel"
        isLoading={saving}
        onConfirm={handleConfirmUpdate}
      />
    </>,
    document.body,
  );
};
