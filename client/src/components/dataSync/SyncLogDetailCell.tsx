import { useLayoutEffect, useRef, useState } from "react";

type SyncLogDetailCellProps = Readonly<{
  detailText: string;
  /** Classes for the detail body (default muted secondary). */
  textClassName?: string;
}>;

/**
 * Detail text clamped to 2 lines; "View more" / "View less" when content overflows.
 */
export function SyncLogDetailCell({
  detailText,
  textClassName = "text-secondary",
}: SyncLogDetailCellProps) {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const [overflowWhenClamped, setOverflowWhenClamped] = useState(false);

  useLayoutEffect(() => {
    if (expanded) return;
    const el = textRef.current;
    if (!el) return;
    const measuredOverflow = el.scrollHeight > el.clientHeight + 1;
    const lineBreaks = detailText.split("\n").length;
    const heuristicMoreThanTwoLines = lineBreaks > 2 || detailText.length > 200;
    setOverflowWhenClamped(measuredOverflow || heuristicMoreThanTwoLines);
  }, [detailText, expanded]);

  if (detailText === "—") {
    return <span className={textClassName}>—</span>;
  }

  const showToggle = overflowWhenClamped || expanded;

  return (
    <div className="min-w-0">
      <div
        ref={textRef}
        className={
          expanded
            ? `break-words whitespace-pre-wrap ${textClassName}`
            : `break-words whitespace-pre-wrap line-clamp-2 ${textClassName}`
        }
      >
        {detailText}
      </div>
      {showToggle ? (
        <button
          type="button"
          className="mt-1 text-left text-button-primary text-[10px] md:text-xs font-semibold hover:opacity-90 cursor-pointer"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "View less" : "View more"}
        </button>
      ) : null}
    </div>
  );
}
