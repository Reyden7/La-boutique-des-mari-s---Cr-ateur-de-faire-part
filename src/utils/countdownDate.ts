/** A wedding date is a calendar day. All visitors use the same reference zone. */
export const COUNTDOWN_TIME_ZONE = "Europe/Paris";
const DAY = 86_400_000;
const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: COUNTDOWN_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function parseCountdownDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match, year = Number(y), month = Number(m), day = Number(d);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, ordinal: date.getTime() / DAY };
}

export function getCountdownToday(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) return "";
  const parts = formatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

/** Compare normalized date ordinals, never elapsed 24-hour periods across DST. */
export function getCountdownDays(targetDate: string, now: Date | string = new Date()): number {
  const target = parseCountdownDate(targetDate), today = parseCountdownDate(typeof now === "string" ? now : getCountdownToday(now));
  return target && today ? Math.max(0, target.ordinal - today.ordinal) : 0;
}

export function getDefaultCountdownDate(now = new Date()): string {
  const today = parseCountdownDate(getCountdownToday(now));
  if (!today) return "";
  const year = Math.min(9999, today.year + 1);
  let day = today.day;
  const format = () => `${String(year).padStart(4, "0")}-${String(today.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  while (!parseCountdownDate(format())) day--;
  return format();
}

/** Find the next Paris day boundary, including 23/25-hour days. Once per day. */
export function getNextCountdownDayDelay(now = new Date()): number {
  const start = now.getTime(), today = getCountdownToday(now);
  if (!today) return DAY;
  let low = start, high = start + 26 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (getCountdownToday(new Date(middle)) === today) low = middle; else high = middle;
  }
  return Math.max(1, high - start);
}
