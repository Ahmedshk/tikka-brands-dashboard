import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveDisplayTimezone } from "../../utils/displayTimezoneHelpers";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import TextField from "@mui/material/TextField";
import OperationsIcon from "@assets/icons/operations.svg?react";
import { Dropdown } from "../../components/common/Dropdown";
import { Layout } from "../../components/common/Layout";
import { ActivityLogDetailsModal, ActivityLogNotesModal, ActivityLogTableCard } from "../../components/ActivityLog";
import { activityLogService } from "../../services/activityLog.service";
import type { RootState } from "../../store/store";
import type { ActivityLogRow } from "../../types/activityLog.types";
import { useCanAccessComponent } from "../../hooks/useCanAccessComponent";

const PAGE_ID = "activity-log";

type ActivityLogEventFilter = "all" | ActivityLogRow["eventType"];

const EVENT_FILTER_OPTIONS = [
  { value: "all", label: "All events" },
  { value: "Discounts", label: "Discounts only" },
  { value: "Refunds", label: "Refunds only" },
] as const;

const GREY_FOCUS_FIELD_SX = {
  "& .MuiOutlinedInput-root": {
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: "#9CA3AF",
    },
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: "#9CA3AF",
    },
  },
} as const;

export const ActivityLog = () => {
  const currentLocation = useSelector(
    (state: RootState) => state.location.currentLocation,
  );
  const allLocationsSelected = useSelector((state: RootState) => state.location.allLocationsSelected);
  const locationId = allLocationsSelected ? '__all__' : (currentLocation?._id ?? null);
  const displayTimezone = useMemo(
    () => resolveDisplayTimezone(allLocationsSelected, currentLocation?.timezone),
    [allLocationsSelected, currentLocation?.timezone],
  );
  const canFullPage = useCanAccessComponent(PAGE_ID, "full-page");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<ActivityLogEventFilter>("all");
  const [selectedRow, setSelectedRow] = useState<ActivityLogRow | null>(null);
  const [notesModalRow, setNotesModalRow] = useState<ActivityLogRow | null>(null);

  const filteredRows = useMemo(() => {
    if (eventFilter === "all") return rows;
    return rows.filter((r) => r.eventType === eventFilter);
  }, [rows, eventFilter]);

  useEffect(() => {
    setSelectedRow((prev) => {
      if (prev == null) return null;
      if (eventFilter === "all") return prev;
      return prev.eventType === eventFilter ? prev : null;
    });
  }, [eventFilter]);

  const fetchRows = useCallback(async () => {
    if (!locationId || !canFullPage) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await activityLogService.getRows(locationId, selectedDate);
      setRows(data.rows);
    } catch {
      setRows([]);
      toast.error("Failed to load activity log.");
    } finally {
      setLoading(false);
    }
  }, [locationId, selectedDate, canFullPage]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleNoteSaved = useCallback(
    (squareOrderId: string, preview: string | null, hasNotes: boolean) => {
      setRows((prev) =>
        prev.map((row) =>
          row.squareOrderId === squareOrderId
            ? { ...row, notesPreview: preview, hasNotes }
            : row,
        ),
      );
      setNotesModalRow((prev) =>
        prev?.squareOrderId === squareOrderId
          ? { ...prev, notesPreview: preview, hasNotes }
          : prev,
      );
      setSelectedRow((prev) =>
        prev?.squareOrderId === squareOrderId
          ? { ...prev, notesPreview: preview, hasNotes }
          : prev,
      );
    },
    [],
  );

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-primary md:text-lg 2xl:text-xl">
            <OperationsIcon className="h-4 w-4 text-primary md:h-5 md:w-5 2xl:h-6 2xl:w-6" aria-hidden />
            Activity Log
          </h2>

          {canFullPage ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto sm:shrink-0">
            <Dropdown
              options={[...EVENT_FILTER_OPTIONS]}
              value={eventFilter}
              onChange={(v) => {
                if (v === "Discounts" || v === "Refunds") setEventFilter(v);
                else setEventFilter("all");
              }}
              placeholder="Filter events"
              aria-label="Filter activity log by event type"
              className="w-full sm:w-[200px]"
              allowEmpty={false}
            />
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                value={selectedDate}
                onChange={(date) => {
                  if (date) setSelectedDate(date);
                }}
                disableFuture
                enableAccessibleFieldDOMStructure={false}
                slots={{ textField: TextField }}
                slotProps={{
                  textField: {
                    size: "small",
                    placeholder: "MM/DD/YYYY",
                    sx: { minWidth: 180, ...GREY_FOCUS_FIELD_SX },
                  },
                }}
              />
            </LocalizationProvider>
          </div>
          ) : null}
        </div>

        {canFullPage ? (
          <>
            <ActivityLogTableCard
              rows={filteredRows}
              loading={loading}
              displayTimezone={displayTimezone}
              showLocationLabel={allLocationsSelected}
              onView={(row) => {
                setSelectedRow(row);
              }}
              onOpenNotes={(row) => {
                setNotesModalRow(row);
              }}
            />

            <ActivityLogDetailsModal
              open={selectedRow != null}
              row={selectedRow}
              displayTimezone={displayTimezone}
              onClose={() => setSelectedRow(null)}
            />

            <ActivityLogNotesModal
              open={notesModalRow != null}
              row={notesModalRow}
              locationId={locationId}
              displayTimezone={displayTimezone}
              onClose={() => setNotesModalRow(null)}
              onSaved={handleNoteSaved}
            />
          </>
        ) : (
          <p className="text-sm text-secondary">
            You do not have access to view the activity log content.
          </p>
        )}
      </div>
    </Layout>
  );
};
