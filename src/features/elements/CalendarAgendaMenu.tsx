import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CalendarElement } from "../../types/editor";
import { buildGoogleCalendarUrl, buildIcsEvent, getCalendarEventError, getIcsFilename } from "../../utils/calendarEvent";

export function CalendarAgendaMenu({ element, style, children }: { element: CalendarElement; style: CSSProperties; children: ReactNode }) {
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), first = useRef<HTMLAnchorElement>(null);
  const id = useId(), error = getCalendarEventError(element);
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    const close = () => setOpen(false);
    const focus = (event: FocusEvent) => { if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key); document.addEventListener("focusin", focus);
    window.addEventListener("resize", close); window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); document.removeEventListener("focusin", focus); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [open]);
  useEffect(() => { setOpen(false); }, [element]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([buildIcsEvent(element)], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = getIcsFilename(element);
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setOpen(false); trigger.current?.focus();
  };
  return <>
    <button ref={trigger} type="button" className="calendar-agenda-button" aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog" disabled={!!error} title={error || undefined} style={style} onClick={(event) => {
      event.stopPropagation(); const rect = trigger.current!.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)), top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 146)) }); setOpen(!open);
    }}>{children}</button>
    {open && !error && createPortal(<div ref={menu} id={id} className="calendar-agenda-menu" role="dialog" aria-label="Ajouter à mon agenda" style={position} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <strong>Ajouter à mon agenda</strong>
      {/* Keep the anchor mounted until the browser has performed its default navigation. */}
      <a ref={first} href={buildGoogleCalendarUrl(element)} target="_blank" rel="noopener noreferrer" onClick={() => { window.setTimeout(() => setOpen(false), 0); }}>Google Agenda ↗</a>
      <button type="button" onClick={download}>Apple / Outlook / autre (.ics)</button>
    </div>, document.body)}
  </>;
}
