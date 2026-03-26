import { useEffect, useRef } from "react";

export interface EmbeddedAdobeSignModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly embedUrl: string | null;
  readonly isLoading?: boolean;
  readonly onIframeLoaded?: () => void;
  readonly onSigned?: () => void;
}

export function EmbeddedAdobeSignModal({
  isOpen,
  onClose,
  embedUrl,
  isLoading = false,
  onIframeLoaded,
  onSigned,
}: EmbeddedAdobeSignModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [isOpen]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== globalThis.location.origin) return;
      if (ev.data?.type === "tikka-adobe-sign-complete") {
        onSigned?.();
        onClose();
      }
    };
    globalThis.addEventListener("message", onMsg);
    return () => globalThis.removeEventListener("message", onMsg);
  }, [onSigned, onClose]);

  if (!embedUrl) return null;

  return (
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="relative w-full min-w-0 max-w-[min(960px,calc(100vw-2rem))]">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Sign PIP Document
            </h2>
          </div>
          <div className="relative min-h-[70vh] w-full flex-1 bg-gray-50">
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75">
                <div className="flex items-center gap-2 text-primary text-sm font-medium">
                  <span className="inline-block w-5 h-5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                  <span>Loading signing iframe...</span>
                </div>
              </div>
            )}
            <iframe
              title="Adobe Sign"
              src={embedUrl}
              onLoad={onIframeLoaded}
              className="min-h-[70vh] w-full flex-1 border-0 bg-gray-50"
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-downloads"
            />
          </div>
        </div>
      </div>
    </dialog>
  );
}
