import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";
import { toAsciiDigits } from "./digits";

export type PhoneResult = { ok: true; e164: string } | { ok: false; error: string };

/**
 * Normalize a phone number typed or imported by a user into E.164.
 * Handles Saudi formats: 05xxxxxxxx, 5xxxxxxxx, 9665xxxxxxxx, 009665xxxxxxxx, +9665xxxxxxxx,
 * Arabic-Indic digits, spaces/dashes/brackets and invisible direction marks.
 */
export function normalizePhone(raw: string, defaultCountry: CountryCode = "SA"): PhoneResult {
  if (!raw) return { ok: false, error: "الرقم فارغ" };
  let s = toAsciiDigits(String(raw))
    .replace(/[‎‏‪-‮⁦-⁩ ]/g, "")
    .trim();
  s = s.replace(/^tel:/i, "");
  // keep a single leading plus and digits only
  const hasPlus = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (!s) return { ok: false, error: "الرقم لا يحتوي على أرقام" };
  if (s.length > 17) return { ok: false, error: "الرقم أطول من المعتاد" };

  let candidates: string[];
  if (hasPlus) candidates = ["+" + s];
  else if (s.startsWith("00")) candidates = ["+" + s.slice(2)];
  else if (s.startsWith("0")) candidates = [s];
  else candidates = [s, "+" + s]; // e.g. "501234567" (national w/o 0) or "966501234567"

  for (const c of candidates) {
    const parsed = c.startsWith("+")
      ? parsePhoneNumberFromString(c)
      : parsePhoneNumberFromString(c, defaultCountry);
    if (parsed && parsed.isValid()) return { ok: true, e164: parsed.number };
  }
  return { ok: false, error: "رقم غير صحيح" };
}

/** Digits only, as required by wa.me links and spreadsheet export. */
export function phoneDigits(e164: string): string {
  return e164.replace(/\D/g, "");
}

/** Human display, e.g. "+966 50 123 4567". */
export function formatPhone(e164: string): string {
  const p = parsePhoneNumberFromString(e164);
  return p ? p.formatInternational() : e164;
}
