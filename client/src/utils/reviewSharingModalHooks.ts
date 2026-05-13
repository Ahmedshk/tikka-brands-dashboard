import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { reviewService } from "../services/review.service";
import type { ActionPlanItem, ManagerReview, ReviewCycle, ReviewSettings, SelfReview } from "../types/review.types";

export function useReviewSharingDialog(isOpen: boolean) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
  }, [isOpen]);

  return dialogRef;
}

export function useReviewSharingData(isOpen: boolean, cycleId: string) {
  const [loading, setLoading] = useState(true);
  const [selfReview, setSelfReview] = useState<SelfReview | null>(null);
  const [managerReview, setManagerReview] = useState<ManagerReview | null>(null);
  /** Full cycle with populated employee (phone, homebase, etc.) for bio. */
  const [cycleDetail, setCycleDetail] = useState<ReviewCycle | null>(null);
  const [reviewSettings, setReviewSettings] = useState<ReviewSettings | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCycleDetail(null);
      setReviewSettings(null);
      setSelfReview(null);
      setManagerReview(null);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const [selfRev, mgrRev, fullCycle, settings] = await Promise.all([
          reviewService.getSelfReview(cycleId).catch(() => null),
          reviewService.getManagerReview(cycleId).catch(() => null),
          reviewService.getCycleById(cycleId).catch(() => null),
          reviewService.getSettings().catch(() => null),
        ]);
        setSelfReview(selfRev);
        setManagerReview(mgrRev);
        setCycleDetail(fullCycle);
        setReviewSettings(settings);
      } catch {
        toast.error("Failed to load review data");
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, cycleId]);

  return { loading, selfReview, managerReview, cycleDetail, reviewSettings };
}

export async function loadExistingActionPlan(cycleId: string): Promise<ActionPlanItem[] | null> {
  try {
    const existing = await reviewService.getActionPlan(cycleId).catch(() => null);
    return existing?.items?.length ? existing.items : null;
  } catch {
    return null;
  }
}

