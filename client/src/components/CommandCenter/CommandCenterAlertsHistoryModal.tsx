import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { commandCenterService } from "../../services/commandCenter.service";
import { commandCenterAlertRowToAlertItem } from "../../utils/commandCenterAlertRowToAlertItem.util";
import { COMMAND_CENTER_ALERT_NEW_BADGE_CLASSNAME } from "../../utils/commandCenterAlertNewBadge.util";
import {
  isLowRatingReviewAlertType,
  renderLowRatingReviewAlertBody,
} from "../../utils/lowRatingReviewAlertDisplay.util";
import type {
  AlertRoleBindingCategory,
  CommandCenterAlertRow,
} from "../../types/alertNotification.types";
import type { LocationApiParams } from "../../utils/locationSelectionHelpers";
import { hasLocationSelection } from "../../utils/locationSelectionHelpers";
import { Spinner } from "../common/Spinner";

const NEW_BADGE_MS = 15 * 60 * 1000;

function isRowNew(createdAt: string, now: number): boolean {
  return now - new Date(createdAt).getTime() < NEW_BADGE_MS;
}

export interface CommandCenterAlertsHistoryModalProps {
  open: boolean;
  onClose: () => void;
  categoryId: AlertRoleBindingCategory;
  categoryTitle: string;
  locationQuery: LocationApiParams;
}

export function CommandCenterAlertsHistoryModal({
  open,
  onClose,
  categoryId,
  categoryTitle,
  locationQuery,
}: CommandCenterAlertsHistoryModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<CommandCenterAlertRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minuteTick, setMinuteTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open || !hasLocationSelection(locationQuery)) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    commandCenterService
      .getAlertHistory(locationQuery, categoryId, { signal: controller.signal })
      .then(setRows)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load history");
        setRows([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, locationQuery, categoryId]);

  if (!open) return null;

  const now = Date.now();
  const sortedRows = [...rows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  let historyContent: ReactNode;
  if (loading) {
    historyContent = (
      <div className="flex min-h-[10rem] flex-1 items-center justify-center">
        <Spinner size="lg" className="text-button-primary" />
      </div>
    );
  } else if (error != null && error !== "") {
    historyContent = (
      <p className="text-xs text-negative md:text-sm" role="alert">
        {error}
      </p>
    );
  } else if (sortedRows.length === 0) {
    historyContent = (
      <p className="text-xs text-secondary md:text-sm">No earlier alerts for this category.</p>
    );
  } else {
    historyContent = (
      <div className="flex flex-col gap-2">
        {sortedRows.map((row) => {
          const alert = commandCenterAlertRowToAlertItem(row);
          const showNew = isRowNew(row.createdAt, now);
          return (
            <div
              key={row.id}
              className="flex flex-wrap items-start gap-x-3 gap-y-1 text-[10px] text-primary md:text-xs 2xl:text-sm"
            >
              <span className="flex min-w-0 flex-1 items-start gap-1.5">
                <span
                  className={`mt-1.5 h-1 w-1 flex-shrink-0 rounded-full md:h-1.5 md:w-1.5 2xl:h-2 2xl:w-2 ${
                    alert.severity === "critical" ? "bg-[#F04B5B]" : "bg-[#FBC52A]"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-primary">
                    <span>{alert.titleLine}</span>
                    {showNew ? (
                      <span
                        className={COMMAND_CENTER_ALERT_NEW_BADGE_CLASSNAME}
                        aria-label="New alert"
                      >
                        New
                      </span>
                    ) : null}
                  </span>
                  {alert.bodyLine != null && alert.bodyLine !== "" && (
                    <span className="mt-0.5 block font-normal text-secondary">
                      {isLowRatingReviewAlertType(alert.alertType)
                        ? renderLowRatingReviewAlertBody(alert.bodyLine)
                        : alert.bodyLine}
                    </span>
                  )}
                  {alert.subtitle != null && alert.subtitle !== "" && (
                    <span className="mt-0.5 block text-[10px] text-secondary opacity-90 md:text-xs">
                      {alert.subtitle}
                    </span>
                  )}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="cc-alert-history-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          dialogRef.current?.close();
          onClose();
        }
      }}
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-2xl">
        <button
          type="button"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="absolute -top-2 -right-2 z-[400] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary md:-top-4 md:-right-4 md:h-8 md:w-8"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg leading-none md:text-xl 2xl:text-2xl">×</span>
        </button>
        <div
          className="relative max-h-[90vh] flex flex-col overflow-hidden rounded-xl border-b border-gray-200 bg-card-background shadow-lg"
          data-minute-tick={minuteTick}
        >
          <div className="relative w-full flex-shrink-0 rounded-t-xl bg-primary px-5 py-3">
            <h2
              id="cc-alert-history-title"
              className="text-sm font-semibold text-white md:text-base 2xl:text-lg"
            >
              Earlier alerts — {categoryTitle}
            </h2>
          </div>
          <div className="min-h-[8rem] flex-1 overflow-y-auto border-x border-gray-200 px-5 pb-4 pt-4 dropdown-list-scrollbar">
            {historyContent}
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
