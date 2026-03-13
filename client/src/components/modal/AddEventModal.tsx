import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddEventModal = ({ isOpen, onClose }: AddEventModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="add-event-modal-title"
      onClose={onClose}
    >
      <div className="relative w-full max-w-md">
        <button
          type="button"
          onClick={() => { dialogRef.current?.close(); onClose(); }}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2 id="add-event-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Add Event
            </h2>
          </div>
          <div className="p-5 border-x border-gray-200">
            <p className="text-sm text-primary">Add event form will be implemented here.</p>
          </div>
        </div>
      </div>
    </dialog>,
    document.body
  );
};
