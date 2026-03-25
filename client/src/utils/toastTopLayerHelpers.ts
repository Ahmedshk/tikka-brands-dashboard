/** True when the Popover API can lift the toast host into the document top layer. */
export function supportsToastPopover(): boolean {
  return typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;
}

function hasOpenModalDialog(): boolean {
  return typeof document !== "undefined" && document.querySelector("dialog[open]") !== null;
}

type PopoverHost = HTMLElement & {
  showPopover: () => void;
  hidePopover: () => void;
};

/**
 * Keeps the toast popover above native `<dialog showModal()>` layers.
 * Top-layer order is last-shown wins; after a dialog opens, we hide+show the popover
 * so it returns to the top. If nothing is open yet, a single showPopover() is enough.
 */
export function promoteToastHost(el: HTMLElement | null): void {
  if (!el || !supportsToastPopover()) return;
  const pop = el as PopoverHost;
  const dialogOpen = hasOpenModalDialog();

  try {
    const open = el.matches(":popover-open");

    if (dialogOpen && open) {
      pop.hidePopover();
      queueMicrotask(() => {
        try {
          pop.showPopover();
        } catch {
          /* ignore */
        }
      });
      return;
    }

    if (!open) {
      pop.showPopover();
    }
  } catch {
    try {
      pop.showPopover();
    } catch {
      /* ignore */
    }
  }
}
