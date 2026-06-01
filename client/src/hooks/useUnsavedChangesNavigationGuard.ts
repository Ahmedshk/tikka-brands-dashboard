import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Blocks in-app navigation and warns on browser refresh/close when settings have unsaved edits.
 * Pair with ConfirmDialog when blocker.state === 'blocked'.
 */
export function useUnsavedChangesNavigationGuard(enabled: boolean) {
  const blocker = useBlocker(enabled);

  useEffect(() => {
    if (!enabled) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [enabled]);

  return blocker;
}
