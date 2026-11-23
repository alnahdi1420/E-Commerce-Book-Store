import { normalizePhone } from "./phone";
import { toAsciiDigits } from "./digits";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export type RawRow = { name: string; phone: string };

export type PreviewRow = {
  key: number;
  name: string;
  rawPhone: string;
  e164: string | null;
  error: string | null;
  /** duplicate of an earlier row in this batch */
  duplicateInBatch: boolean;
  /** already a guest in this event */
  alreadyInEvent: boolean;
  include: boolean;
};

function cleanName(s: string): string {
  return s
    .replace(/[‎‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:،؛\-–|]+|[\s,;:،؛\-–|]+$/g, "")
    .slice(0, 100)
    .trim();
}

/**
 * Parse free text, one guest per line: "أحمد 0501234567", "0501234567 - أحمد", "أحمد,0501234567", "أحمد\t+966...".
 */
export function parsePastedText(text: string): RawRow[] {
  const rows: RawRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const ascii = toAsciiDigits(line);
    if (!ascii.trim()) continue;
    const m = ascii.match(/(\+|00)?\d[\d\s\-().]{6,}\d/);
    if (!m) {
      rows.push({ name: cleanName(line), phone: "" });
      continue;
    }
    const phone = m[0];
    const name = cleanName(ascii.slice(0, m.index) + " " + ascii.slice((m.index ?? 0) + phone.length));
    rows.push({ name, phone });
  }
  return rows;
}

/** Minimal vCard (VCF) parser: FN/N + every TEL. Handles line folding and QUOTED-PRINTABLE. */
export function parseVcf(text: string): RawRow[] {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").replace(/=\n/g, "");
  const out: RawRow[] = [];
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1);
  for (const card of cards) {
    const body = card.split(/END:VCARD/i)[0];
    let fn = "";
    let n = "";
    const tels: string[] = [];
    for (const line of body.split("\n")) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const head = line.slice(0, idx);
      let value = line.slice(idx + 1).trim();
      const prop = head.split(";")[0].replace(/^item\d+\./i, "").toUpperCase();
      if (/ENCODING=QUOTED-PRINTABLE/i.test(head)) value = decodeQuotedPrintable(value);
      if (prop === "FN") fn = value;
      else if (prop === "N") n = value.split(";").filter(Boolean).reverse().join(" ");
      else if (prop === "TEL") tels.push(value.replace(/^tel:/i, ""));
    }
    const name = cleanName((fn || n).replace(/\\,/g, ",").replace(/\\;/g, ";"));
    for (const t of tels) out.push({ name, phone: t });
    if (!tels.length && name) out.push({ name, phone: "" });
  }
  return out;
}

function decodeQuotedPrintable(s: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(s.charCodeAt(i) & 0xff);
  }
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return s;
  }
}

/** Guess which columns hold the name and phone in a table (CSV / Excel). */
export function guessColumns(table: string[][]): { header: boolean; name: number; phone: number } {
  const first = table[0] ?? [];
  const header = first.some((c) => /name|اسم|phone|mobile|جوال|هاتف|رقم|tel/i.test(String(c ?? "")));
  const sample = table.slice(header ? 1 : 0, 30);
  const cols = Math.max(0, ...table.slice(0, 30).map((r) => r.length));
  let phone = -1;
  let best = 0;
  for (let c = 0; c < cols; c++) {
    const hits = sample.filter((r) => normalizePhone(String(r[c] ?? "")).ok).length;
    if (hits > best) {
      best = hits;
      phone = c;
    }
  }
  if (header) {
    const hp = first.findIndex((c) => /phone|mobile|جوال|هاتف|رقم|tel/i.test(String(c ?? "")));
    if (hp >= 0 && phone < 0) phone = hp;
  }
  let name = header ? first.findIndex((c) => /name|اسم/i.test(String(c ?? ""))) : -1;
  if (name < 0 || name === phone) {
    name = -1;
    for (let c = 0; c < cols; c++) {
      if (c === phone) continue;
      if (sample.some((r) => /\p{L}/u.test(String(r[c] ?? "")))) {
        name = c;
        break;
      }
    }
  }
  return { header, name, phone };
}

export function tableToRows(table: string[][], cfg: { header: boolean; name: number; phone: number }): RawRow[] {
  return table
    .slice(cfg.header ? 1 : 0)
    .map((r) => ({
      name: cleanName(String(cfg.name >= 0 ? (r[cfg.name] ?? "") : "")),
      phone: String(cfg.phone >= 0 ? (r[cfg.phone] ?? "") : ""),
    }))
    .filter((r) => r.name || r.phone);
}

/** Validate + dedupe a batch against itself and the event's existing numbers. */
export function buildPreview(rows: RawRow[], existingE164: Iterable<string> = []): PreviewRow[] {
  const existing = new Set(existingE164);
  const seen = new Set<string>();
  return rows.slice(0, MAX_IMPORT_ROWS).map((r, i) => {
    const name = cleanName(r.name);
    const p = normalizePhone(r.phone);
    const e164 = p.ok ? p.e164 : null;
    let error: string | null = p.ok ? null : r.phone ? p.error : "الرقم مفقود";
    if (!error && !name) error = "الاسم مفقود";
    const duplicateInBatch = !!e164 && seen.has(e164);
    const alreadyInEvent = !!e164 && existing.has(e164);
    if (e164) seen.add(e164);
    return {
      key: i,
      name,
      rawPhone: r.phone,
      e164,
      error,
      duplicateInBatch,
      alreadyInEvent,
      include: !error && !duplicateInBatch && !alreadyInEvent,
    };
  });
}
