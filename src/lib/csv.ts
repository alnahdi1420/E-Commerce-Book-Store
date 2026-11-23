/** Neutralize spreadsheet formula injection (OWASP): prefix risky leading characters. */
export function safeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: unknown) => {
    const s = safeCell(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens Arabic text correctly.
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
