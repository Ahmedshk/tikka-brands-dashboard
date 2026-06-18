import { useEffect, useState } from "react";
import Popover from "@mui/material/Popover";
import {
  hasActiveCompletedAtFilter,
  validateCompletedAtFilterForApply,
} from "../../utils/kitchenPerformanceCompletedAtFilter.util";
import { parseHmTo12HourParts } from "../../utils/kitchenPerformanceCompletedAtTimeInput.util";
import { KitchenPerformanceCompletedAtTimeField } from "./KitchenPerformanceCompletedAtTimeField";

export interface KitchenPerformanceCompletedAtFilterProps {
  appliedStart: string;
  appliedEnd: string;
  onApply: (start: string, end: string) => void;
  onClear: () => void;
  className?: string;
}

export function KitchenPerformanceCompletedAtFilter({
  appliedStart,
  appliedEnd,
  onApply,
  onClear,
  className = "",
}: Readonly<KitchenPerformanceCompletedAtFilterProps>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [draftStart, setDraftStart] = useState(appliedStart);
  const [draftEnd, setDraftEnd] = useState(appliedEnd);
  const [startComplete, setStartComplete] = useState(false);
  const [endComplete, setEndComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = Boolean(anchorEl);
  const filtersActive = hasActiveCompletedAtFilter({
    start: appliedStart,
    end: appliedEnd,
  });

  useEffect(() => {
    if (open) {
      setDraftStart(appliedStart);
      setDraftEnd(appliedEnd);
      setStartComplete(parseHmTo12HourParts(appliedStart) != null);
      setEndComplete(parseHmTo12HourParts(appliedEnd) != null);
      setError(null);
    }
  }, [open, appliedStart, appliedEnd]);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setError(null);
  };

  const handleApply = () => {
    const result = validateCompletedAtFilterForApply(draftStart, draftEnd, {
      startComplete,
      endComplete,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    onApply(draftStart.trim(), draftEnd.trim());
    handleClose();
  };

  const handleClear = () => {
    setDraftStart("");
    setDraftEnd("");
    setStartComplete(false);
    setEndComplete(false);
    setError(null);
    onClear();
    handleClose();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={`relative border border-gray-300 rounded-lg px-3 py-2 text-sm text-primary bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-quaternary/30 ${className}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Filters
        {filtersActive ? (
          <span
            className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-button-primary"
            aria-label="Completed at filters active"
          />
        ) : null}
      </button>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: { mt: 1, p: 2, width: "auto", minWidth: 220, maxWidth: "calc(100vw - 24px)" },
          },
        }}
      >
        <div className="space-y-3">
          <p className="text-sm font-semibold text-primary">Completed at</p>
          <div className="space-y-4">
            <KitchenPerformanceCompletedAtTimeField
              idPrefix="kitchen-completed-at-filter-start"
              label="Start"
              value={draftStart}
              isOpen={open}
              onDraftChange={({ hm, isComplete }) => {
                setDraftStart(hm);
                setStartComplete(isComplete);
                setError(null);
              }}
            />
            <KitchenPerformanceCompletedAtTimeField
              idPrefix="kitchen-completed-at-filter-end"
              label="End"
              value={draftEnd}
              isOpen={open}
              onDraftChange={({ hm, isComplete }) => {
                setDraftEnd(hm);
                setEndComplete(isComplete);
                setError(null);
              }}
            />
          </div>
          {error ? (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-sm font-medium text-secondary hover:text-primary"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90"
            >
              Filter
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
