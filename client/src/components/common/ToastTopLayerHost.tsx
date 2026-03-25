import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Toaster, useToaster } from "react-hot-toast";
import { promoteToastHost, supportsToastPopover } from "../../utils/toastTopLayerHelpers";

/**
 * Renders react-hot-toast in a React portal on `document.body`.
 * Uses the Popover API when available so toasts can sit above native `<dialog showModal()>`.
 * Dialogs enter the top layer after earlier popovers; we re-promote when toasts change and
 * when any `dialog[open]` mutates so the toast layer stays last in the top-layer stack.
 */
export function ToastTopLayerHost() {
  const hostRef = useRef<HTMLDivElement>(null);
  const { toasts } = useToaster({ duration: 4000 });

  const visibleKey = toasts.filter((t) => t.visible).map((t) => t.id).join(",");

  useLayoutEffect(() => {
    promoteToastHost(hostRef.current);
  }, []);

  useEffect(() => {
    if (!toasts.some((t) => t.visible)) return;
    promoteToastHost(hostRef.current);
    const raf = requestAnimationFrame(() => promoteToastHost(hostRef.current));
    const t = globalThis.setTimeout(() => promoteToastHost(hostRef.current), 0);
    return () => {
      cancelAnimationFrame(raf);
      globalThis.clearTimeout(t);
    };
  }, [visibleKey, toasts.length]);

  useEffect(() => {
    if (!supportsToastPopover()) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        promoteToastHost(hostRef.current);
      });
    };
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, []);

  const usePopover = supportsToastPopover();

  const node = (
    <div
      ref={hostRef}
      {...(usePopover ? { popover: "manual" as const } : {})}
      id="app-toast-layer"
      className="fixed inset-x-0 top-4 z-[2147483647] flex justify-center border-0 bg-transparent p-0 shadow-none outline-none"
      style={{ pointerEvents: "none" }}
    >
      <Toaster
        position="top-center"
        toastOptions={{ duration: 4000 }}
      />
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
