import type { KeyboardEvent } from "react";

/**
 * Arrow-key, Home and End navigation for a tablist, with focus following the selection.
 * Pair it with `tabIndex={selected ? 0 : -1}` on each tab so only the current one is in the tab order.
 */
export function tabKeyHandler<T extends string>(ids: readonly T[], current: T, select: (id: T) => void, elementId: (id: T) => string) {
  return (event: KeyboardEvent) => {
    const index = ids.indexOf(current);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % ids.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + ids.length) % ids.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ids.length - 1;
    else return;
    event.preventDefault();
    select(ids[next]);
    document.getElementById(elementId(ids[next]))?.focus();
  };
}
