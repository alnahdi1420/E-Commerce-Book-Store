/**
 * Acceptance scenarios from the product brief, exercised through the real TypeScript
 * libraries (tokens, phone normalization, templates, wa.me links) against the real
 * migration running in PGlite. Mirrors what the server actions do.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { createDb, type Db } from "./harness";

process.env.INVITE_TOKEN_SECRET = "acceptance-test-secret-0123456789-abcdefghijkl";

const { guestToken, guestTokenHash } = await import("@/lib/tokens");
const { normalizePhone } = await import("@/lib/phone");
const { renderMessage, TEMPLATES } = await import("@/lib/templates");
const { whatsappLink } = await import("@/lib/whatsapp");
const { buildPreview, parsePastedText } = await import("@/lib/import");

let db: Db;
let organizer: string;
let ws: string;
let eventId: string;
const BASE = "https://daawati.test";
type G = { id: string; name: string; phone: string };
const guests: G[] = [];

beforeAll(async () => {
  db = await createDb();
  organizer = await db.createUser("host@example.com");
  [{ workspace_id: ws }] = await db.q<{ workspace_id: string }>(`select workspace_id from public.workspace_members where user_id = $1`, [organizer]);
  eventId = await db.as(organizer, async () => {
    const [e] = await db.q<{ id: string }>(
      `insert into public.events (workspace_id, title, kind, starts_at, host_name, location_name, location_url)
       values ($1, 'حفل عشاء', 'dinner', '2030-12-03T16:30:00Z', 'أبو جعفر', 'قاعة الريم', 'https://maps.app.goo.gl/x') returning id`,
      [ws],
    );
    return e.id;
  });
});

/** Same steps as the addGuests server action. */
async function addGuestsLikeServer(rows: { name: string; phone: string }[]) {
  const payload = rows.map((r) => {
    const p = normalizePhone(r.phone);
    if (!p.ok) throw new Error("bad phone in test");
    const id = randomUUID();
    return { id, name: r.name, phone: p.e164, token_hash: guestTokenHash(id, 1) };
  });
  const [{ r }] = await db.as(organizer, () => db.q<{ r: { inserted: number } }>(`select public.add_guests($1, $2::jsonb) as r`, [eventId, JSON.stringify(payload)]));
  for (const p of payload) guests.push({ id: p.id, name: p.name, phone: p.phone });
  return r;
}

const link = (g: G) => `${BASE}/i/${guestToken(g.id, 1)}`;

describe("Scenario: dinner with 5 guests, each with an independent link", () => {
  it("adds 5 guests and each gets a unique, working link", async () => {
    const r = await addGuestsLikeServer([
      { name: "أحمد", phone: "0501234567" },
      { name: "سارة", phone: "+966 50 234 5678" },
      { name: "خالد", phone: "966503456789" },
      { name: "نورة", phone: "٠٥٠٤٥٦٧٨٩٠" },
      { name: "فهد", phone: "00966505678901" },
    ]);
    expect(r.inserted).toBe(5);
    const links = new Set(guests.map(link));
    expect(links.size).toBe(5);
    for (const g of guests) {
      const [{ r: inv }] = await db.as(null, () => db.q<{ r: { guest_name: string } }>(`select public.get_invitation($1) as r`, [guestToken(g.id, 1)]));
      expect(inv.guest_name).toBe(g.name);
    }
  });

  it("'Open WhatsApp' for Ahmed targets his number with his name, the event details and his own link", () => {
    const ahmed = guests[0];
    const [e] = [{ title: "حفل عشاء", starts_at: "2030-12-03T16:30:00Z", timezone: "Asia/Riyadh", host_name: "أبو جعفر", location_name: "قاعة الريم", location_url: "https://maps.app.goo.gl/x" }];
    const url = whatsappLink(ahmed.phone, renderMessage(TEMPLATES.formal.body, e, ahmed.name, link(ahmed)));
    expect(url.startsWith("https://wa.me/966501234567?text=")).toBe(true);
    const text = decodeURIComponent(url.split("?text=")[1]);
    expect(text).toContain("أحمد");
    expect(text).toContain("حفل عشاء");
    expect(text).toContain("قاعة الريم");
    expect(text).toContain(link(ahmed));
    expect(text).not.toContain(link(guests[1]));
  });

  it("opening the chat is not recorded as sent; only the organizer's confirmation is", async () => {
    const ahmed = guests[0];
    await db.as(organizer, () => db.q(`select public.mark_guest_opened($1)`, [ahmed.id]));
    let [s] = await db.as(organizer, () => db.q<{ send_status: string }>(`select send_status from public.event_guests where id = $1`, [ahmed.id]));
    expect(s.send_status).toBe("opened");
    await db.as(organizer, () => db.q(`select public.mark_guest_sent($1, true)`, [ahmed.id]));
    [s] = await db.as(organizer, () => db.q<{ send_status: string }>(`select send_status from public.event_guests where id = $1`, [ahmed.id]));
    expect(s.send_status).toBe("sent");
  });

  it("Ahmed taps «سأحضر» and Sara «أعتذر»: dashboard numbers are exact", async () => {
    await db.as(null, () => db.q(`select public.submit_rsvp($1, 'attending', 0, null)`, [guestToken(guests[0].id, 1)]));
    await db.as(null, () => db.q(`select public.submit_rsvp($1, 'declined', 0, null)`, [guestToken(guests[1].id, 1)]));
    const [s] = await db.as(organizer, () =>
      db.q<{ total: number; attending: number; declined: number; pending: number }>(`select total, attending, declined, pending from public.event_stats where event_id = $1`, [eventId]),
    );
    expect(s).toEqual({ total: 5, attending: 1, declined: 1, pending: 3 });
    const attending = await db.as(organizer, () =>
      db.q<{ name: string }>(`select name from public.event_guests where event_id = $1 and rsvp_status = 'attending'`, [eventId]),
    );
    expect(attending.map((a) => a.name)).toEqual(["أحمد"]);
  });

  it("a reply received only in the WhatsApp chat is recorded manually, with its origin", async () => {
    await db.as(organizer, () => db.q(`select public.set_guest_rsvp($1, 'attending', 0)`, [guests[2].id]));
    const [a] = await db.as(organizer, () =>
      db.q<{ source: string; actor_user_id: string }>(`select source, actor_user_id from public.rsvp_audit where guest_id = $1`, [guests[2].id]),
    );
    expect(a).toEqual({ source: "organizer", actor_user_id: organizer });
  });

  it("rotating a link kills the old one and the new one works", async () => {
    const g = guests[3];
    await db.as(organizer, () => db.q(`select public.rotate_guest_token($1, $2, 2)`, [g.id, guestTokenHash(g.id, 2)]));
    const [old] = await db.as(null, () => db.q<{ r: unknown }>(`select public.get_invitation($1) as r`, [guestToken(g.id, 1)]));
    const [fresh] = await db.as(null, () => db.q<{ r: { guest_name: string } }>(`select public.get_invitation($1) as r`, [guestToken(g.id, 2)]));
    expect(old.r).toBeNull();
    expect(fresh.r.guest_name).toBe("نورة");
  });
});

describe("Scenario: import with mixed Saudi formats and duplicates", () => {
  it("previews before saving and flags duplicates (in file and already in event)", () => {
    const rows = parsePastedText("ريم 0509990001\nريم مكرر +966509990001\nأحمد مكرر 966501234567\nخطأ 12345");
    const preview = buildPreview(rows, guests.map((g) => g.phone));
    expect(preview.map((p) => p.include)).toEqual([true, false, false, false]);
    expect(preview[1].duplicateInBatch).toBe(true);
    expect(preview[2].alreadyInEvent).toBe(true);
    expect(preview[3].error).toBeTruthy();
  });
});
