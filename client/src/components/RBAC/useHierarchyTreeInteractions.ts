import { useEffect } from 'react';
import { clampZoom, ZOOM_STEP } from '../../utils/hierarchyTreeHelpers';

function isMouseInteractive(el: EventTarget | null, scrollParent: HTMLElement): boolean {
  let n = el as HTMLElement | null;
  while (n && n !== scrollParent) {
    const tag = n.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'A') return true;
    if (n.getAttribute('draggable') === 'true') return true;
    n = n.parentElement;
  }
  return false;
}

function isTapTarget(el: EventTarget | null, scrollParent: HTMLElement): boolean {
  let n = el as HTMLElement | null;
  while (n && n !== scrollParent) {
    const tag = n.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'A') return true;
    n = n.parentElement;
  }
  return false;
}

function findDraggableCard(el: EventTarget | null, scrollParent: HTMLElement): HTMLElement | null {
  let n = el as HTMLElement | null;
  while (n && n !== scrollParent) {
    if (n.dataset.roleId && n.getAttribute('draggable') === 'true') return n;
    n = n.parentElement;
  }
  return null;
}

function findTargetRoleId(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  const card = (el as HTMLElement | null)?.closest('[data-role-id]') as HTMLElement | null;
  return card?.dataset.roleId ?? null;
}

export interface HierarchyTreeInteractionCallbacks {
  zoomChange: (zoom: number) => void;
  dragStart: (roleId: string) => void;
  dragEnd: () => void;
  drop: (draggedId: string, targetId: string) => void;
}

export function useHierarchyTreeInteractions(
  containerRef: React.RefObject<HTMLDivElement | null>,
  zoomRef: React.RefObject<number>,
  callbacksRef: React.RefObject<HierarchyTreeInteractionCallbacks>,
  setTouchHoverRoleId: (id: string | null) => void
): void {
  useEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const scrollParent: HTMLElement = parent;

    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panScrollLeft = 0;
    let panScrollTop = 0;

    let touchDragRoleId: string | null = null;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let ghost: HTMLDivElement | null = null;
    let ghostOffsetX = 0;
    let ghostOffsetY = 0;
    let initialPinchDist = 0;
    let initialPinchZoom = 0;
    let isTouchPanning = false;
    let tpStartX = 0;
    let tpStartY = 0;
    let tpScrollLeft = 0;
    let tpScrollTop = 0;
    let touchOriginX = 0;
    let touchOriginY = 0;

    function createGhost(cardEl: HTMLElement, x: number, y: number) {
      const subtreeEl = cardEl.closest('.hierarchy-tree-node');
      if (!subtreeEl) return;

      ghost = subtreeEl.cloneNode(true) as HTMLDivElement;

      const cardRect = cardEl.getBoundingClientRect();
      const subtreeRect = subtreeEl.getBoundingClientRect();
      ghostOffsetX = cardRect.left + cardRect.width / 2 - subtreeRect.left;
      ghostOffsetY = cardRect.top + cardRect.height / 2 - subtreeRect.top;

      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${x - ghostOffsetX}px`,
        top: `${y - ghostOffsetY}px`,
        pointerEvents: 'none',
        zIndex: '9999',
        opacity: '0.85',
        transform: `scale(${zoomRef.current})`,
        transformOrigin: 'top left',
      });

      ghost.querySelectorAll('button').forEach((btn) => btn.remove());
      document.body.appendChild(ghost);
    }

    function removeGhost() {
      ghost?.remove();
      ghost = null;
    }

    function clearLongPress() {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      callbacksRef.current?.zoomChange(clampZoom(zoomRef.current + delta));
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || isMouseInteractive(e.target, scrollParent)) return;
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panScrollLeft = scrollParent.scrollLeft;
      panScrollTop = scrollParent.scrollTop;
      scrollParent.style.cursor = 'grabbing';
      scrollParent.style.userSelect = 'none';
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning) return;
      scrollParent.scrollLeft = panScrollLeft - (e.clientX - panStartX);
      scrollParent.scrollTop = panScrollTop - (e.clientY - panStartY);
    };

    const handleMouseUp = () => {
      if (!isPanning) return;
      isPanning = false;
      scrollParent.style.cursor = '';
      scrollParent.style.userSelect = '';
    };

    function handleTwoTouchMove(e: TouchEvent): boolean {
      if (e.touches.length !== 2 || initialPinchDist <= 0) return false;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      if (t0 == null || t1 == null) return true;
      e.preventDefault();
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      const scale = Math.hypot(dx, dy) / initialPinchDist;
      callbacksRef.current?.zoomChange(clampZoom(initialPinchZoom * scale));
      return true;
    }

    function handleSingleTouchMove(touch: Touch, e: TouchEvent) {
      if (longPressTimer != null && !touchDragRoleId) {
        if (
          Math.abs(touch.clientX - touchOriginX) > 10 ||
          Math.abs(touch.clientY - touchOriginY) > 10
        ) {
          clearLongPress();
          isTouchPanning = true;
          tpStartX = touchOriginX;
          tpStartY = touchOriginY;
          tpScrollLeft = scrollParent.scrollLeft;
          tpScrollTop = scrollParent.scrollTop;
        }
      }

      if (touchDragRoleId && ghost) {
        e.preventDefault();
        ghost.style.left = `${touch.clientX - ghostOffsetX}px`;
        ghost.style.top = `${touch.clientY - ghostOffsetY}px`;
        const targetId = findTargetRoleId(touch.clientX, touch.clientY);
        setTouchHoverRoleId(targetId === touchDragRoleId ? null : targetId);
      } else if (isTouchPanning) {
        e.preventDefault();
        scrollParent.scrollLeft = tpScrollLeft - (touch.clientX - tpStartX);
        scrollParent.scrollTop = tpScrollTop - (touch.clientY - tpStartY);
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        if (t0 == null || t1 == null) return;
        clearLongPress();
        isTouchPanning = false;
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        initialPinchDist = Math.hypot(dx, dy);
        initialPinchZoom = zoomRef.current;
        e.preventDefault();
        return;
      }
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      if (touch == null) return;
      touchOriginX = touch.clientX;
      touchOriginY = touch.clientY;

      if (isTapTarget(touch.target, scrollParent)) return;

      const card = findDraggableCard(touch.target, scrollParent);
      if (card) {
        const roleId = card.dataset.roleId!;
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          touchDragRoleId = roleId;
          callbacksRef.current?.dragStart(roleId);
          createGhost(card, touch.clientX, touch.clientY);
          if (navigator.vibrate) navigator.vibrate(50);
        }, 400);
        e.preventDefault();
      } else {
        isTouchPanning = true;
        tpStartX = touch.clientX;
        tpStartY = touch.clientY;
        tpScrollLeft = scrollParent.scrollLeft;
        tpScrollTop = scrollParent.scrollTop;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (handleTwoTouchMove(e)) return;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (touch == null) return;
      handleSingleTouchMove(touch, e);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      clearLongPress();

      if (touchDragRoleId) {
        const touch = e.changedTouches[0];
        if (touch) {
          const targetId = findTargetRoleId(touch.clientX, touch.clientY);
          if (targetId && targetId !== touchDragRoleId) {
            callbacksRef.current?.drop(touchDragRoleId, targetId);
          }
        }
        touchDragRoleId = null;
        removeGhost();
        callbacksRef.current?.dragEnd();
        setTouchHoverRoleId(null);
      }
      isTouchPanning = false;
      initialPinchDist = 0;
    };

    scrollParent.addEventListener('wheel', handleWheel, { passive: false });
    scrollParent.addEventListener('mousedown', handleMouseDown);
    globalThis.addEventListener('mousemove', handleMouseMove);
    globalThis.addEventListener('mouseup', handleMouseUp);
    scrollParent.addEventListener('touchstart', handleTouchStart, { passive: false });
    scrollParent.addEventListener('touchmove', handleTouchMove, { passive: false });
    scrollParent.addEventListener('touchend', handleTouchEnd);
    scrollParent.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      scrollParent.removeEventListener('wheel', handleWheel);
      scrollParent.removeEventListener('mousedown', handleMouseDown);
      globalThis.removeEventListener('mousemove', handleMouseMove);
      globalThis.removeEventListener('mouseup', handleMouseUp);
      scrollParent.removeEventListener('touchstart', handleTouchStart);
      scrollParent.removeEventListener('touchmove', handleTouchMove);
      scrollParent.removeEventListener('touchend', handleTouchEnd);
      scrollParent.removeEventListener('touchcancel', handleTouchEnd);
      removeGhost();
      clearLongPress();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
