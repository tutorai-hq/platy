import { type RefObject, useEffect } from "react";

/**
 * Scroll an element into the card's view when it appears or changes (R-27). The card's buttons
 * are pinned over its bottom edge, so new content there (the keypad's last row, a choice, a
 * verdict) was hidden under them until the student scrolled (teen test re-run 2026-10-26). The
 * card's `scroll-padding-bottom` keeps the element above the pinned row.
 */
export function useIntoView(ref: RefObject<HTMLElement | null>, key: unknown, enabled = true): void {
  useEffect(() => {
    // jsdom has no scrollIntoView; a server render has no element at all.
    if (enabled) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [ref, key, enabled]);
}
