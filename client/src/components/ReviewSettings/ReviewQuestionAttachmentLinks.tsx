import ViewIcon from "@assets/icons/view.svg?react";
import { openDocumentProxyInNewTab } from "../../services/training.service";
import { openSelfReviewAttachmentByToken } from "../../services/review.service";
import { getQuestionAttachmentSuggestedFilename } from "../../utils/reviewQuestionnaireHelpers";
import type { ReviewQuestionAttachment } from "../../types/review.types";

export type QuestionAttachmentWithUrl = ReviewQuestionAttachment & { url?: string };

interface ReviewQuestionAttachmentLinksProps {
  readonly attachments?: QuestionAttachmentWithUrl[];
  /** Authenticated dashboard: document proxy. */
  readonly variant?: "proxy" | "directUrl";
  /** Public self-review page: token-scoped document endpoint (preferred over directUrl for correct filenames). */
  readonly selfReviewToken?: string;
}

export function ReviewQuestionAttachmentLinks({
  attachments,
  variant = "proxy",
  selfReviewToken,
}: ReviewQuestionAttachmentLinksProps) {
  const list = attachments?.filter((a) => a.publicId) ?? [];
  if (list.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs font-medium text-secondary">Reference documents</p>
      <ul className="flex flex-wrap gap-2">
        {list.map((att) => {
          const label = att.filename?.trim() || att.format?.trim() || "Document";
          return (
            <li key={att.publicId}>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-xs text-button-primary hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  const token = selfReviewToken?.trim();
                  if (token) {
                    void openSelfReviewAttachmentByToken(
                      token,
                      att.publicId,
                      getQuestionAttachmentSuggestedFilename(att),
                    );
                    return;
                  }
                  if (variant === "directUrl" && att.url?.trim()) {
                    window.open(att.url, "_blank", "noopener,noreferrer");
                    return;
                  }
                  void openDocumentProxyInNewTab(
                    att.publicId,
                    att.resourceType,
                    getQuestionAttachmentSuggestedFilename(att) ?? att.filename,
                  );
                }}
              >
                <ViewIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span className="truncate max-w-[200px]" title={label}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
