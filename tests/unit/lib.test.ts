import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { normalizePhone, phoneDigits } from "@/lib/phone";
import { whatsappLink } from "@/lib/whatsapp";
import { renderMessage, TEMPLATES, templateBody } from "@/lib/templates";
import { validateMapUrl } from "@/lib/maps";
import { safeCell, toCsv } from "@/lib/csv";
import { buildPreview, guessColumns, parsePastedText, parseVcf, tableToRows } from "@/lib/import";
import { zonedToUtcIso, utcToZonedInputs } from "@/lib/dates";
import { buildIcs } from "@/lib/ics";

describe("Saudi phone normalization", () => {
  const expected = "+966501234567";
  it.each([
    "0501234567",
    "501234567",
    "966501234567",
    "+966501234567",
    "00966501234567",
    "+966 50 123 4567",
    "050-123-4567",
    "(050) 123 4567",
    "٠٥٠١٢٣٤٥٦٧",
    "‎+966 50 123 4567‏",
    "tel:+966501234567",
  ])("%s → +966501234567", (input) => {
    expect(normalizePhone(input)).toEqual({ ok: true, e164: expected });
  });

  it("supports other countries with explicit codes", () => {
    expect(normalizePhone("+971501234567")).toEqual({ ok: true, e164: "+971501234567" });
    expect(normalizePhone("+20 100 123 4567")).toEqual({ ok: true, e164: "+201001234567" });
    expect(normalizePhone("0096555123456")).toEqual({ ok: true, e164: "+96555123456" });
  });

  it.each(["", "abc", "12345", "05012", "+966 12", "0501234567890123456"])("rejects %j", (input) => {
    expect(normalizePhone(input).ok).toBe(false);
  });

  it("produces digits for wa.me", () => {
    expect(phoneDigits("+966501234567")).toBe("966501234567");
  });
});

describe("WhatsApp link", () => {
  it("targets the guest's number and pre-fills an encoded message", () => {
    const link = whatsappLink("+966501234567", "مرحبا أحمد\nhttps://x.test/i/abc?x=1&y=2");
    expect(link.startsWith("https://wa.me/966501234567?text=")).toBe(true);
    const text = decodeURIComponent(link.split("text=")[1]);
    expect(text).toBe("مرحبا أحمد\nhttps://x.test/i/abc?x=1&y=2");
  });
});

describe("message templates", () => {
  const event = {
    title: "حفل عشاء",
    starts_at: "2026-12-03T16:30:00.000Z", // 19:30 Riyadh
    timezone: "Asia/Riyadh",
    host_name: "أبو جعفر",
    location_name: "قاعة الريم",
    location_address: "الجبيل",
    location_url: "https://maps.app.goo.gl/x",
  };
  it("fills every variable for each built-in template", () => {
    for (const key of ["formal", "friendly", "short"] as const) {
      const msg = renderMessage(TEMPLATES[key].body, event, "أحمد", "https://app.test/i/TOKEN");
      expect(msg).toContain("أحمد");
      expect(msg).toContain("حفل عشاء");
      expect(msg).toContain("https://app.test/i/TOKEN");
      expect(msg).toContain("7:30");
      expect(msg).not.toMatch(/\{[^}]+\}/);
    }
  });
  it("custom template without a link still gets the link appended", () => {
    const body = templateBody({ template_key: "custom", message_template: "أهلًا {اسم_المدعو}" });
    expect(renderMessage(body, event, "سارة", "https://app.test/i/T")).toBe("أهلًا سارة\n\nhttps://app.test/i/T");
  });
  it("does not treat guest input as template syntax", () => {
    const msg = renderMessage("{اسم_المدعو} - {رابط_الدعوة}", event, "{رابط_الدعوة}", "https://a.test/i/1");
    expect(msg.startsWith("https://a.test/i/1")).toBe(false);
  });
  it("removes empty location lines", () => {
    const msg = renderMessage(TEMPLATES.formal.body, { ...event, location_name: null, location_address: null, location_url: null }, "أ", "https://a.test/i/1");
    expect(msg).not.toMatch(/📍\s*$/m);
  });
});

describe("map links", () => {
  it("accepts Google Maps short and long links", () => {
    expect(validateMapUrl("https://maps.app.goo.gl/AbC123")).toMatchObject({ ok: true, isKnownMap: true });
    expect(validateMapUrl("https://www.google.com/maps/place/x")).toMatchObject({ ok: true, isKnownMap: true });
    expect(validateMapUrl("maps.google.com/?q=26.9,49.6")).toMatchObject({ ok: true, isKnownMap: true });
  });
  it("upgrades http and accepts other https venue links (flagged as not a map)", () => {
    expect(validateMapUrl("http://maps.apple.com/?q=x")).toMatchObject({ ok: true, url: "https://maps.apple.com/?q=x" });
    expect(validateMapUrl("https://venue.example.com/hall")).toMatchObject({ ok: true, isKnownMap: false });
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "https://", "not a url", "ftp://x.com", "https://user:pw@evil.com"])(
    "rejects %s",
    (u) => expect(validateMapUrl(u).ok).toBe(false),
  );
});

describe("CSV export safety", () => {
  it("neutralizes formula injection", () => {
    expect(safeCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(safeCell("+1")).toBe("'+1");
    expect(safeCell("@SUM")).toBe("'@SUM");
    expect(safeCell("أحمد")).toBe("أحمد");
  });
  it("quotes commas/newlines and adds BOM", () => {
    const csv = toCsv([["a,b", 'q"t', "x\ny"]]);
    expect(csv).toBe('﻿"a,b","q""t","x\ny"');
  });
});

describe("import parsing", () => {
  it("parses pasted lines in many shapes", () => {
    const rows = parsePastedText("أحمد 0501234567\n0502345678 - سارة\nخالد,+966503456789\n\nنورة\t٠٥٠٤٥٦٧٨٩٠");
    expect(rows).toEqual([
      { name: "أحمد", phone: "0501234567" },
      { name: "سارة", phone: "0502345678" },
      { name: "خالد", phone: "+966503456789" },
      { name: "نورة", phone: "0504567890" },
    ]);
  });

  it("detects duplicates across formats and against the event, and flags invalid rows", () => {
    const preview = buildPreview(
      [
        { name: "أحمد", phone: "0501234567" },
        { name: "أحمد ٢", phone: "+966 50 123 4567" },
        { name: "سارة", phone: "966502345678" },
        { name: "خطأ", phone: "123" },
        { name: "", phone: "0503456789" },
      ],
      ["+966502345678"],
    );
    expect(preview[0]).toMatchObject({ e164: "+966501234567", include: true });
    expect(preview[1]).toMatchObject({ duplicateInBatch: true, include: false });
    expect(preview[2]).toMatchObject({ alreadyInEvent: true, include: false });
    expect(preview[3]).toMatchObject({ e164: null, include: false });
    expect(preview[4]).toMatchObject({ error: "الاسم مفقود", include: false });
  });

  it("guesses name/phone columns of a spreadsheet with headers", () => {
    const table = [
      ["#", "الاسم", "الجوال"],
      ["1", "أحمد", "0501234567"],
      ["2", "سارة", "0502345678"],
    ];
    const cfg = guessColumns(table);
    expect(cfg).toEqual({ header: true, name: 1, phone: 2 });
    expect(tableToRows(table, cfg)).toEqual([
      { name: "أحمد", phone: "0501234567" },
      { name: "سارة", phone: "0502345678" },
    ]);
  });

  it("parses vCard files incl. folding, multiple numbers and quoted-printable", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Ahmed Ali",
      "TEL;TYPE=CELL:+966 50 123 4567",
      "TEL;TYPE=HOME:0133334444",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;=D8=B3=D8=A7=D8=B1=D8=A9;;;",
      "TEL;CELL:0502345678",
      "END:VCARD",
    ].join("\r\n");
    expect(parseVcf(vcf)).toEqual([
      { name: "Ahmed Ali", phone: "+966 50 123 4567" },
      { name: "Ahmed Ali", phone: "0133334444" },
      { name: "سارة", phone: "0502345678" },
    ]);
  });
});

describe("time zones", () => {
  it("converts Riyadh wall-clock to UTC and back", () => {
    const iso = zonedToUtcIso("2026-12-03", "19:30", "Asia/Riyadh");
    expect(iso).toBe("2026-12-03T16:30:00.000Z");
    expect(utcToZonedInputs(iso, "Asia/Riyadh")).toEqual({ date: "2026-12-03", time: "19:30" });
  });
});

describe("ICS", () => {
  it("escapes text and uses UTC times", () => {
    const ics = buildIcs({ uid: "1@x", title: "عشاء, خاص", startsAt: "2026-12-03T16:30:00.000Z" });
    expect(ics).toContain("DTSTART:20261203T163000Z");
    expect(ics).toContain("DTEND:20261203T193000Z");
    expect(ics).toContain("SUMMARY:عشاء\\, خاص");
  });
});

describe("guest tokens", () => {
  it("are deterministic per (id, version), rotate with version, and only hashes are comparable", async () => {
    process.env.INVITE_TOKEN_SECRET = "x".repeat(40);
    const { guestToken, guestTokenHash, sha256Hex } = await import("@/lib/tokens");
    const a = guestToken("11111111-1111-1111-1111-111111111111", 1);
    expect(a).toHaveLength(43);
    expect(guestToken("11111111-1111-1111-1111-111111111111", 1)).toBe(a);
    expect(guestToken("11111111-1111-1111-1111-111111111111", 2)).not.toBe(a);
    expect(guestToken("11111111-1111-1111-1111-111111111112", 1)).not.toBe(a);
    expect(guestTokenHash("11111111-1111-1111-1111-111111111111", 1)).toBe(sha256Hex(a));
  });
});
