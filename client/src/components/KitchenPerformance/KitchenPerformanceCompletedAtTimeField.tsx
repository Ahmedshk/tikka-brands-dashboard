import { useEffect, useRef, useState } from "react";
import {
  formatKitchenPerformanceMinuteLabel,
  KITCHEN_PERFORMANCE_HOUR_12_OPTIONS,
  KITCHEN_PERFORMANCE_MINUTE_OPTIONS,
  parseHmTo12HourParts,
  tryFormatHmFrom12HourDraft,
} from "../../utils/kitchenPerformanceCompletedAtTimeInput.util";

const selectBaseClassName =
  "px-2 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-white focus:outline-none focus:ring-2 focus:ring-quaternary/30";

const hourSelectClassName = `${selectBaseClassName} w-[3.25rem]`;
const minuteSelectClassName = `${selectBaseClassName} w-[3.75rem]`;
const meridiemSelectClassName = `${selectBaseClassName} w-[4.25rem]`;

export type KitchenPerformanceCompletedAtTimeDraft = {
  hm: string;
  isComplete: boolean;
};

type Props = {
  idPrefix: string;
  label: string;
  value: string;
  isOpen: boolean;
  onDraftChange: (draft: KitchenPerformanceCompletedAtTimeDraft) => void;
};

export function KitchenPerformanceCompletedAtTimeField({
  idPrefix,
  label,
  value,
  isOpen,
  onDraftChange,
}: Readonly<Props>) {
  const [hourValue, setHourValue] = useState("");
  const [minuteValue, setMinuteValue] = useState("");
  const [meridiemValue, setMeridiemValue] = useState("");
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!isOpen) return;

    const parts = parseHmTo12HourParts(value);
    if (parts) {
      setHourValue(String(parts.hour12));
      setMinuteValue(String(parts.minute));
      setMeridiemValue(parts.meridiem);
      return;
    }

    if (justOpened) {
      setHourValue("");
      setMinuteValue("");
      setMeridiemValue("");
    }
  }, [isOpen, value]);

  const updateField = (
    hour12Raw: string,
    minuteRaw: string,
    meridiemRaw: string,
  ) => {
    setHourValue(hour12Raw);
    setMinuteValue(minuteRaw);
    setMeridiemValue(meridiemRaw);
    const hm = tryFormatHmFrom12HourDraft(hour12Raw, minuteRaw, meridiemRaw);
    onDraftChange({
      hm,
      isComplete: hm !== "",
    });
  };

  return (
    <div>
      <span className="block text-xs text-tertiary mb-1">{label}</span>
      <div className="inline-flex gap-2">
        <select
          id={`${idPrefix}-hour`}
          value={hourValue}
          onChange={(e) => updateField(e.target.value, minuteValue, meridiemValue)}
          className={hourSelectClassName}
          aria-label={`${label} hour`}
        >
          <option value="" disabled hidden>
            Hr
          </option>
          {KITCHEN_PERFORMANCE_HOUR_12_OPTIONS.map((hour) => (
            <option key={hour} value={String(hour)}>
              {hour}
            </option>
          ))}
        </select>
        <select
          id={`${idPrefix}-minute`}
          value={minuteValue}
          onChange={(e) => updateField(hourValue, e.target.value, meridiemValue)}
          className={minuteSelectClassName}
          aria-label={`${label} minute`}
        >
          <option value="" disabled hidden>
            Min
          </option>
          {KITCHEN_PERFORMANCE_MINUTE_OPTIONS.map((minute) => (
            <option key={minute} value={String(minute)}>
              {formatKitchenPerformanceMinuteLabel(minute)}
            </option>
          ))}
        </select>
        <select
          id={`${idPrefix}-meridiem`}
          value={meridiemValue}
          onChange={(e) => updateField(hourValue, minuteValue, e.target.value)}
          className={meridiemSelectClassName}
          aria-label={`${label} AM or PM`}
        >
          <option value="" disabled hidden>
            —
          </option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}
