import type { CalendarElement, CalendarEventConfig } from "../types/editor";
import { parseCountdownDate } from "./countdownDate.ts";

export const DEFAULT_CALENDAR_EVENT: CalendarEventConfig = {
  enabled: false, buttonLabel: "Ajouter à mon agenda", title: "Notre mariage", timezone: "Europe/Paris",
  buttonFontFamily: "Montserrat", buttonFontSize: 13, buttonTextColor: "#ffffff",
  buttonBackgroundColor: "#795746", buttonBorderColor: "#795746", buttonBorderWidth: 1, buttonRadius: 8, buttonGap: 12,
};
export const getCalendarEventConfig = (element: CalendarElement): CalendarEventConfig => ({ ...DEFAULT_CALENDAR_EVENT, ...element.calendarEvent });
const DAY = 86_400_000;
const pad = (value: number, digits = 2) => String(value).padStart(digits, "0");
const clean = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
const dateString = (ordinal: number) => {
  const date = new Date(ordinal * DAY);
  if (date.getUTCFullYear() > 9999) throw new Error("La date de fin dépasse l’année 9999.");
  return `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
};
const utcStamp = (instant: number) => {
  const date = new Date(instant);
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new Error("Date horaire hors limites.");
  return `${dateString(Math.floor(instant / DAY))}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
};
function timeMinutes(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Renseignez une heure valide au format HH:MM.");
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}
function zoneFormatter(timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  } catch { throw new Error("Renseignez un fuseau horaire valide, par exemple Europe/Paris."); }
}
/** Resolve a wall-clock time with Intl, independent of the visitor's timezone.
 * Reject spring DST gaps; on an autumn overlap choose the first occurrence. */
function zonedInstant(ordinal: number, minutes: number, formatter: Intl.DateTimeFormat): number {
  const wall = ordinal * DAY + minutes * 60_000;
  const wallAt = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (key: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === key)?.value);
    const date = new Date(0); date.setUTCFullYear(part("year"), part("month") - 1, part("day")); date.setUTCHours(part("hour"), part("minute"), part("second"), 0);
    return date.getTime();
  };
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) { const sample = wall + hours * 3_600_000; offsets.add(wallAt(sample) - sample); }
  const matches = [...offsets].map((offset) => wall - offset).filter((candidate) => wallAt(candidate) === wall).sort((a, b) => a - b);
  if (!matches.length) throw new Error("Cette heure n’existe pas dans ce fuseau lors du changement d’heure. Choisissez une autre heure.");
  return matches[0];
}

export function getCalendarEventData(element: CalendarElement) {
  const config = getCalendarEventConfig(element);
  const date = parseCountdownDate(`${pad(element.year, 4)}-${pad(element.month)}-${pad(element.highlightedDay ?? 0)}`);
  if (!date) throw new Error("Choisissez un jour mis en avant valide dans le Calendrier pour ajouter la date à l’agenda.");
  const timezone = config.timezone?.trim() || "Europe/Paris";
  const title = clean(config.title?.trim() || "Notre mariage"), location = clean(config.location || ""), description = clean(config.description || "");
  if (!config.startTime) return { title, location, description, timezone, allDay: true, start: dateString(date.ordinal), end: dateString(date.ordinal + 1) };
  const formatter = zoneFormatter(timezone), startMinutes = timeMinutes(config.startTime);
  const start = zonedInstant(date.ordinal, startMinutes, formatter);
  const endMinutes = config.endTime ? timeMinutes(config.endTime) : null;
  const end = endMinutes === null ? start + 2 * 3_600_000 : zonedInstant(date.ordinal + (endMinutes <= startMinutes ? 1 : 0), endMinutes, formatter);
  if (end <= start) throw new Error("L’heure de fin doit être après le début de l’événement.");
  return { title, location, description, timezone, allDay: false, start: utcStamp(start), end: utcStamp(end) };
}

export function buildGoogleCalendarUrl(element: CalendarElement): string {
  const event = getCalendarEventData(element);
  const url = new URL("https://calendar.google.com/calendar/render");
  url.search = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: `${event.start}/${event.end}`, details: event.description, location: event.location, ...(event.allDay ? {} : { ctz: event.timezone }) }).toString();
  return url.href;
}

export const escapeIcsText = (value: string) => clean(value).replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
/** RFC 5545: CRLF and folding at 75 UTF-8 octets, without splitting characters. */
export function foldIcsLine(value: string): string {
  const encoder = new TextEncoder(); let line = "", bytes = 0; const lines: string[] = [];
  for (const char of value) {
    const length = encoder.encode(char).length;
    if (bytes + length > 75) { lines.push(line); line = " "; bytes = 1; }
    line += char; bytes += length;
  }
  lines.push(line); return lines.join("\r\n");
}
export function buildIcsEvent(element: CalendarElement, now = new Date()): string {
  const event = getCalendarEventData(element);
  const uid = (element.id || "wedding").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//La Boutique des Mariés//Invitation//FR", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${uid}@laboutiquedesmaries.fr`, `DTSTAMP:${utcStamp(now.getTime())}`, `DTSTART${event.allDay ? ";VALUE=DATE" : ""}:${event.start}`, `DTEND${event.allDay ? ";VALUE=DATE" : ""}:${event.end}`,
    `SUMMARY:${escapeIcsText(event.title)}`, `LOCATION:${escapeIcsText(event.location)}`, `DESCRIPTION:${escapeIcsText(event.description)}`, "END:VEVENT", "END:VCALENDAR"].map(foldIcsLine).join("\r\n") + "\r\n";
}
export function getIcsFilename(element: CalendarElement): string {
  const title = getCalendarEventConfig(element).title || "mariage";
  const slug = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/g, "");
  return `${slug || "mariage"}.ics`;
}
export function getCalendarEventError(element: CalendarElement): string | null {
  try { getCalendarEventData(element); return null; } catch (error) { return error instanceof Error ? error.message : "Événement invalide."; }
}
