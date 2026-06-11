import { useEffect, useState } from 'react';
import Popover from '@mui/material/Popover';
import { validateRatingFilterForApply, hasActiveRatingFilter } from '../../utils/ratingsReviewFilterHelpers';

export interface RatingsReviewRatingRangeFilterProps {
  appliedMin: string;
  appliedMax: string;
  onApply: (min: string, max: string) => void;
  onClear: () => void;
  className?: string;
}

const inputClassName =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-white focus:outline-none focus:ring-2 focus:ring-quaternary/30';

export function RatingsReviewRatingRangeFilter({
  appliedMin,
  appliedMax,
  onApply,
  onClear,
  className = '',
}: Readonly<RatingsReviewRatingRangeFilterProps>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [draftMin, setDraftMin] = useState(appliedMin);
  const [draftMax, setDraftMax] = useState(appliedMax);
  const [error, setError] = useState<string | null>(null);

  const open = Boolean(anchorEl);
  const filtersActive = hasActiveRatingFilter(appliedMin, appliedMax);

  useEffect(() => {
    if (open) {
      setDraftMin(appliedMin);
      setDraftMax(appliedMax);
      setError(null);
    }
  }, [open, appliedMin, appliedMax]);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setError(null);
  };

  const handleApply = () => {
    const result = validateRatingFilterForApply(draftMin, draftMax);
    if (result.error) {
      setError(result.error);
      return;
    }
    onApply(draftMin.trim(), draftMax.trim());
    handleClose();
  };

  const handleClear = () => {
    setDraftMin('');
    setDraftMax('');
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
            aria-label="Rating filters active"
          />
        ) : null}
      </button>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: { mt: 1, p: 2, width: 280, maxWidth: 'calc(100vw - 24px)' },
          },
        }}
      >
        <div className="space-y-3">
          <p className="text-sm font-semibold text-primary">Star rating</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ratings-filter-min-stars" className="block text-xs text-tertiary mb-1">
                Min stars
              </label>
              <input
                id="ratings-filter-min-stars"
                type="number"
                min={1}
                max={5}
                step={1}
                inputMode="numeric"
                placeholder="1"
                value={draftMin}
                onChange={(e) => {
                  setDraftMin(e.target.value);
                  setError(null);
                }}
                className={inputClassName}
                aria-label="Minimum star rating"
              />
            </div>
            <div>
              <label htmlFor="ratings-filter-max-stars" className="block text-xs text-tertiary mb-1">
                Max stars
              </label>
              <input
                id="ratings-filter-max-stars"
                type="number"
                min={1}
                max={5}
                step={1}
                inputMode="numeric"
                placeholder="5"
                value={draftMax}
                onChange={(e) => {
                  setDraftMax(e.target.value);
                  setError(null);
                }}
                className={inputClassName}
                aria-label="Maximum star rating"
              />
            </div>
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
