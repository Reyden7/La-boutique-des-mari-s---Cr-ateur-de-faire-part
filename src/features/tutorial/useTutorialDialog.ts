import { useEffect, useRef, type RefObject } from "react";

export function useTutorialDialog(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void, focusKey: unknown = open) {
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const previous = document.activeElement as HTMLElement | null;
    node.querySelector<HTMLElement>("button:not(.tutorial-close)")?.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const controls = [...node.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled)")];
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", keyboard);
    return () => { node.removeEventListener("keydown", keyboard); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open, ref, focusKey]);
}
