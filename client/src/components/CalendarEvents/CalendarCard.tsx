import { useMemo } from 'react';
import { Calendar, dateFnsLocalizer, type View, type SlotInfo } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import './calendar-big-calendar.scss';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { en: enUS },
});

const DEFAULT_EVENT_BG = 'rgba(107, 114, 128, 0.35)';

export interface CalendarEventItem {
  id?: string;
  start: Date;
  end: Date;
  title: string;
  /** Cell background (rgba / hex). */
  color?: string;
}

export interface CalendarCardProps {
  events: CalendarEventItem[];
  date?: Date;
  selectedDate?: Date | null;
  view?: View;
  onView?: (view: View) => void;
  onNavigate?: (date: Date, view: string) => void;
  onSelectEvent?: (event: CalendarEventItem) => void;
  onSelectSlot?: (slotInfo: SlotInfo) => void;
  onDrillDown?: (date: Date, view: View) => void;
  className?: string;
}

const CALENDAR_VIEWS: View[] = ['month', 'week', 'day'];

export const CalendarCard = ({
  events,
  date,
  selectedDate = null,
  view,
  onView,
  onNavigate,
  onSelectEvent,
  onSelectSlot,
  onDrillDown,
  className = '',
}: CalendarCardProps) => {
  const defaultDate = useMemo(() => date ?? new Date(), [date]);

  const eventPropGetter = (event: CalendarEventItem) => {
    const color = event.color ?? DEFAULT_EVENT_BG;
    return { style: { backgroundColor: color } };
  };

  const dayPropGetter = (day: Date) => {
    if (!selectedDate) return {};
    const same =
      day.getDate() === selectedDate.getDate() &&
      day.getMonth() === selectedDate.getMonth() &&
      day.getFullYear() === selectedDate.getFullYear();
    if (!same) return {};
    return {
      className: 'rbc-day-bg rbc-selected-day',
      style: { backgroundColor: 'rgba(0,0,0,0.08)' },
    };
  };

  return (
    <div className={`${cardClass} flex flex-col ${className}`}>
      <div className="p-4 h-[400px] min-h-[400px] md:h-[520px] md:min-h-[520px]">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          view={view ?? 'month'}
          views={CALENDAR_VIEWS}
          date={defaultDate}
          onView={onView}
          onNavigate={onNavigate}
          onSelectEvent={onSelectEvent}
          onSelectSlot={onSelectSlot}
          onDrillDown={onDrillDown}
          selectable
          eventPropGetter={eventPropGetter}
          dayPropGetter={dayPropGetter}
          popup
          className="calendar-card"
        />
      </div>
    </div>
  );
};
