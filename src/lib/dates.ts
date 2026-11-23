/** Date helpers that are explicit about the event's own time zone. */

const GREG = "ar-u-ca-gregory-nu-latn";
const HIJRI = "ar-SA-u-ca-islamic-umalqura-nu-latn";

export function formatDate(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(GREG, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(
    new Date(iso),
  );
}

export function formatHijri(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(HIJRI, { day: "numeric", month: "long", year: "numeric", timeZone }).format(new Date(iso));
}

export function formatTime(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(GREG, { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(new Date(iso));
}

export function formatShort(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(GREG, { day: "numeric", month: "short", timeZone }).format(new Date(iso));
}

export function formatDateTime(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(GREG, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(iso));
}

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - utcMs;
}

/** Convert a wall-clock date ("2026-12-03") + time ("19:30") in `timeZone` to a UTC ISO string. */
export function zonedToUtcIso(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - tzOffsetMs(guess, timeZone);
  utc = guess - tzOffsetMs(utc, timeZone); // second pass handles DST edges
  return new Date(utc).toISOString();
}

/** Split a UTC instant into wall-clock date/time inputs for `timeZone`. */
export function utcToZonedInputs(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
