import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Spinner } from '../common/Spinner';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  variant?: 'default' | 'danger';
  isLoading?: boolean;
}

export const ConfirmDialog = ({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'default',
  isLoading = false,
}: ConfirmDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  // Sync parent state when dialog is closed by any means (Escape, backdrop, or programmatic)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (dialogRef.current?.open) {
      dialogRef.current.close();
    } else {
      onClose();
    }
  };

  const handleConfirm = async () => {
    try {
      await Promise.resolve(onConfirm());
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      } else {
        onClose();
      }
    } catch {
      // Caller handles error; dialog stays open
    }
  };

  const confirmButtonClass =
    variant === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
      : 'bg-button-primary text-white hover:opacity-90 focus:ring-button-primary';

  return createPortal(
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      className="modal-full-viewport z-[460] m-0 bg-transparent border-0 p-4 outline-none hidden open:grid place-items-center [&::backdrop]:bg-black/50"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 bg-card-background p-6 shadow-lg">
      <h2 id="confirm-dialog-title" className="text-lg font-semibold text-secondary mb-2">
        {title}
      </h2>
      <p id="confirm-dialog-message" className="text-sm text-primary mb-6">
        {message}
      </p>
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-primary hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-60"
          title={cancelLabel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isLoading}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-60 ${confirmButtonClass}`}
          title={confirmLabel}
        >
          {isLoading ? (
            <>
              <Spinner size="sm" className="text-inherit" />
              Please wait...
            </>
          ) : (
            confirmLabel
          )}
        </button>
      </div>
      </div>
    </dialog>,
    document.body
  );
};
