"use client";

import { useEffect } from "react";

/**
 * Number fields change only by typing: turning the mouse wheel over a focused
 * number field scrolls the page instead of changing the value.
 */
export function NumberInputGuard() {
  useEffect(() => {
    const onWheel = () => {
      const field = document.activeElement;
      if (field instanceof HTMLInputElement && field.type === "number") field.blur();
    };
    document.addEventListener("wheel", onWheel, { passive: true, capture: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, []);
  return null;
}
