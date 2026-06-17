import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import UploadIcon from "@assets/icons/upload.svg?react";
import { Dropdown } from "../common/Dropdown";
import {
  PENDING_LOCAL_FILE_ROW_CLASSNAME,
  PENDING_UPLOAD_TAG_CLASSNAME,
} from "../../utils/createTrainingModalHelpers";
import type { LocationListItem } from "../../types";
import type { KitchenPerformancePeriodValue } from "../../utils/kitchenPerformancePeriodRange";
import { periodToDateRange } from "../../utils/kitchenPerformancePeriodRange";
import { KitchenPerformancePeriodPicker } from "./KitchenPerformancePeriodPicker";

interface KitchenPerformanceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (
    locationId: string,
    range: { startDate: string; endDate: string },
    file: File,
  ) => Promise<void>;
  defaultPeriod: KitchenPerformancePeriodValue;
  timezone: string;
  locations: LocationListItem[];
}

export const KitchenPerformanceImportModal = ({
  isOpen,
  onClose,
  onImport,
  defaultPeriod,
  timezone,
  locations,
}: KitchenPerformanceImportModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [period, setPeriod] = useState<KitchenPerformancePeriodValue>(defaultPeriod);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importLocationId, setImportLocationId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const showLocationPicker = locations.length > 1;
  const locationOptions = useMemo(
    () => locations.map((loc) => ({ value: loc._id, label: loc.storeName })),
    [locations],
  );

  const importLocation = useMemo(
    () => locations.find((loc) => loc._id === importLocationId) ?? null,
    [importLocationId, locations],
  );

  const importTimezone = importLocation?.timezone?.trim() || timezone;

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
      setPeriod(defaultPeriod);
      setSelectedFile(null);
      setImportLocationId(locations.length === 1 ? (locations[0]?._id ?? "") : "");
      setError("");
      return;
    }
    dialogRef.current?.close();
  }, [defaultPeriod, isOpen, locations]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (showLocationPicker && !importLocationId) {
      setError("Please select a location for this import.");
      return;
    }
    const locationId = importLocationId || locations[0]?._id;
    if (!locationId) {
      setError("Please select a location for this import.");
      return;
    }
    if (period.periodType === "custom" && (!period.periodStart || !period.periodEnd)) {
      setError("Please select a start and end date for the import period.");
      return;
    }
    if (!selectedFile) {
      setError("Please choose a CSV file.");
      return;
    }

    let range: { startDate: string; endDate: string };
    try {
      range = periodToDateRange(period, importTimezone);
    } catch {
      setError("Please select a valid start and end date for the import period.");
      return;
    }

    try {
      setSubmitting(true);
      await onImport(locationId, range, selectedFile);
      onClose();
    } catch (importError) {
      const message =
        importError instanceof Error
          ? importError.message
          : "Failed to import kitchen performance CSV.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="kitchen-performance-import-title"
      onClose={onClose}
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="w-full rounded-t-xl bg-primary px-5 py-3">
            <h2
              id="kitchen-performance-import-title"
              className="text-sm md:text-base 2xl:text-lg font-semibold text-white"
            >
              Import Kitchen Performance CSV
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 border-x border-gray-200">
              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}

              {showLocationPicker ? (
                <div>
                  <p className="text-sm font-medium text-primary mb-2">
                    Location <span className="text-red-600">*</span>
                  </p>
                  <p className="text-xs text-secondary mb-2">
                    CSV data will be imported for the selected location only.
                  </p>
                  <Dropdown
                    options={locationOptions}
                    value={importLocationId}
                    onChange={setImportLocationId}
                    placeholder="Select location"
                    aria-label="Import location"
                    className="w-full"
                    allowEmpty
                  />
                </div>
              ) : null}

              <div>
                <p className="text-sm font-medium text-primary mb-2">Import period</p>
                <p className="text-xs text-secondary mb-2">
                  Tickets are assigned to a report day from{" "}
                  <span className="font-medium">Time Created</span>. Naive timestamps in the CSV are treated
                  as local time for this location; values with Z or an offset are parsed as absolute times.
                  All derived dates must fall within this period.
                </p>
                <KitchenPerformancePeriodPicker
                  value={period}
                  onChange={setPeriod}
                  timezone={importTimezone}
                  className="w-full sm:w-auto"
                  disablePortal
                />
              </div>

              <div>
                <p className="text-sm font-medium text-primary mb-2">CSV File</p>
                <input
                  id="kitchen-csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
                <label
                  htmlFor="kitchen-csv-file"
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-primary bg-white hover:bg-gray-50 cursor-pointer"
                >
                  <UploadIcon className="w-4 h-4" />
                  Choose CSV
                </label>
                {selectedFile ? (
                  <div className={`mt-3 w-full ${PENDING_LOCAL_FILE_ROW_CLASSNAME}`}>
                    <span className="text-sm text-primary break-all">
                      {selectedFile.name}
                      <span className={PENDING_UPLOAD_TAG_CLASSNAME}>(pending upload)</span>
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-secondary">No file selected</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50/50">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-primary hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Importing..." : "Import CSV"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};
