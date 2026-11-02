import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./modalLayer.css";

let scrollLocks = 0;
let previousOverflow = "";

/** Native modal top layer: document z-index and transformed parents cannot cover it. */
export function ModalLayer({ children, onClose, busy = false, label }: {
  children: ReactNode; onClose: () => void; busy?: boolean; label: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const current = useRef({ onClose, busy });
  current.current = { onClose, busy };
  useLayoutEffect(() => {
    const node = dialog.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (scrollLocks++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    node.showModal();
    // The inner panel keeps the existing accessible name/role and visual styles.
    (node.querySelector<HTMLElement>('[autofocus],button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? node).focus();
    return () => {
      node.close();
      if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<dialog ref={dialog} className="studio-modal-layer" aria-label={label} tabIndex={-1}
    onKeyDown={event => {
      // Keep editor shortcuts outside this portal from acting on the document.
      event.stopPropagation();
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')]
        .filter(node => node.tabIndex >= 0 && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); event.currentTarget.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first.focus(); }
    }}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!current.current.busy) current.current.onClose(); }}>
    {children}
  </dialog>, document.body);
}
