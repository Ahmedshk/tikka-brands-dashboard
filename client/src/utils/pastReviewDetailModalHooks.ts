import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { reviewService } from "../services/review.service";
import type { ReviewCycleSnapshot, ReviewSettings } from "../types/review.types";

export function usePastReviewDetailData(isOpen: boolean, cycleId: string | null) {
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<ReviewCycleSnapshot | null>(null);
  const [reviewSettings, setReviewSettings] = useState<ReviewSettings | null>(null);

  useEffect(() => {
    if (!isOpen || !cycleId) {
      setSnapshot(null);
      setReviewSettings(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [data, settings] = await Promise.all([
          reviewService.getCycleSnapshot(cycleId),
          reviewService.getSettings().catch(() => null),
        ]);
        if (!cancelled) {
          setSnapshot(data);
          setReviewSettings(settings);
        }
      } catch {
        toast.error("Failed to load review detail");
        if (!cancelled) {
          setSnapshot(null);
          setReviewSettings(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, cycleId]);

  return { loading, snapshot, reviewSettings };
}

export function usePastReviewDetailDialogLayer({
  isOpen,
  employeePastListOpen,
  onClose,
}: {
  isOpen: boolean;
  employeePastListOpen: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const suppressNextDialogCloseCallbackRef = useRef(false);

  const handleDialogClose = () => {
    if (suppressNextDialogCloseCallbackRef.current) {
      suppressNextDialogCloseCallbackRef.current = false;
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      dialogRef.current?.close();
      return;
    }

    if (employeePastListOpen) {
      suppressNextDialogCloseCallbackRef.current = true;
      dialogRef.current?.close();
      return;
    }

    dialogRef.current?.showModal();
  }, [isOpen, employeePastListOpen]);

  return { dialogRef, handleDialogClose };
}

