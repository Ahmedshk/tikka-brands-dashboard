type NavigationClickEvent = Pick<
  MouseEvent,
  'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'button'
>;

/** True when the user intends to open the link in a new tab/window (modifier or non-primary click). */
export function isModifiedNavigationClick(event: NavigationClickEvent): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}
