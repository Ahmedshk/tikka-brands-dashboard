import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import TextField from "@mui/material/TextField";
import OperationsIcon from "@assets/icons/operations.svg?react";
import ImportIcon from "@assets/icons/import.svg?react";
import { Layout } from "../../components/common/Layout";
import type { RootState } from "../../store/store";
import type { KitchenPerformanceRow } from "../../types/kitchenPerformance.types";
import { kitchenPerformanceService } from "../../services/kitchenPerformance.service";
import {
  KitchenPerformanceImportModal,
  KitchenPerformanceTableCard,
} from "../../components/KitchenPerformance";

const PAGE_SIZE = 10;
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

export const KitchenPerformance = () => {
  const currentLocation = useSelector(
    (state: RootState) => state.location.currentLocation,
  );
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [rows, setRows] = useState<KitchenPerformanceRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const fetchKitchenRows = useCallback(async () => {
    if (!currentLocation?._id) {
      setRows([]);
      setTotalItems(0);
      setTotalPages(1);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await kitchenPerformanceService.getRows(
        currentLocation._id,
        selectedDate,
        { page, limit: PAGE_SIZE },
      );
      setRows(data.rows);
      setTotalItems(data.meta.total);
      setTotalPages(data.meta.totalPages);
      if (data.meta.page !== page) {
        setPage(data.meta.page);
      }
    } catch {
      setRows([]);
      setTotalItems(0);
      setTotalPages(1);
      toast.error("Failed to load kitchen performance.");
    } finally {
      setLoading(false);
    }
  }, [currentLocation?._id, page, selectedDate]);

  useEffect(() => {
    fetchKitchenRows();
  }, [fetchKitchenRows]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [page, totalPages]);

  const handleImport = async (date: Date, file: File) => {
    if (!currentLocation?._id) {
      toast.error("Please select a location first.");
      return;
    }
    await kitchenPerformanceService.importCsv(currentLocation._id, date, file);
    toast.success("Kitchen performance CSV imported.");
    setSelectedDate(date);
    setPage(1);
    await fetchKitchenRows();
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <OperationsIcon className="h-4 w-4 text-primary md:h-5 md:w-5 2xl:h-6 2xl:w-6" aria-hidden />
            Kitchen Performance
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                value={selectedDate}
                onChange={(date) => {
                  if (date) {
                    setSelectedDate(date);
                    setPage(1);
                  }
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
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <ImportIcon className="w-4 h-4" />
              Import CSV
            </button>
          </div>
        </div>

        <KitchenPerformanceTableCard
          rows={rows}
          loading={loading}
          onView={() => {
            toast("Row details view will be added soon.");
          }}
          pagination={{
            currentPage: page,
            totalPages,
            totalItems,
            pageSize: PAGE_SIZE,
            onPageChange: setPage,
          }}
        />
      </div>

      <KitchenPerformanceImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImport}
        defaultDate={selectedDate}
      />
    </Layout>
  );
};
