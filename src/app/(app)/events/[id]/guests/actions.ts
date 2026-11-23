"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";
import { guestTokenHash } from "@/lib/tokens";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { MAX_IMPORT_ROWS } from "@/lib/import";

const uuid = z.string().uuid();

const rowsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(100),
      phone: z.string().max(40),
      contact_id: z.string().uuid().optional().nullable(),
    }),
  )
  .min(1)
  .max(MAX_IMPORT_ROWS);

export type AddGuestsResult = { inserted: number; skipped: { name: string; phone: string; reason: string }[]; invalid: number };

export async function addGuests(
  eventId: string,
  rows: { name: string; phone: string; contact_id?: string | null }[],
  saveContacts = false,
): Promise<ActionResult<AddGuestsResult>> {
  if (!uuid.safeParse(eventId).success) return { ok: false, error: "مناسبة غير معروفة" };
  const parsed = rowsSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "تحقق من الأسماء والأرقام (الاسم مطلوب لكل مدعو)." };

  let invalid = 0;
  const seen = new Set<string>();
  const payload: { id: string; name: string; phone: string; token_hash: string; contact_id: string | null }[] = [];
  for (const r of parsed.data) {
    const p = normalizePhone(r.phone);
    if (!p.ok) {
      invalid++;
      continue;
    }
    if (seen.has(p.e164)) continue;
    seen.add(p.e164);
    const id = randomUUID();
    payload.push({ id, name: r.name, phone: p.e164, token_hash: guestTokenHash(id, 1), contact_id: r.contact_id ?? null });
  }
  if (!payload.length) return { ok: false, error: "لا توجد أرقام صحيحة لإضافتها." };

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("add_guests", {
    p_event: eventId,
    p_rows: payload,
    p_save_contacts: saveContacts,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/events/${eventId}`, "layout");
  const res = data as { inserted: number; skipped: { name: string; phone: string; reason: string }[] };
  return { ok: true, data: { ...res, invalid } };
}

export async function updateGuest(eventId: string, guestId: string, name: string, phone: string): Promise<ActionResult> {
  if (!uuid.safeParse(guestId).success) return { ok: false, error: "مدعو غير معروف" };
  const n = name.trim();
  if (!n || n.length > 100) return { ok: false, error: "اكتب اسمًا صحيحًا" };
  const p = normalizePhone(phone);
  if (!p.ok) return { ok: false, error: p.error };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("update_guest", { p_guest: guestId, p_name: n, p_phone: p.e164 });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/events/${eventId}`, "layout");
  return { ok: true };
}

export async function deleteGuests(eventId: string, ids: string[]): Promise<ActionResult> {
  const parsed = z.array(uuid).min(1).max(MAX_IMPORT_ROWS).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "اختر مدعوين" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("event_guests").delete().eq("event_id", eventId).in("id", parsed.data).select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "لا تملك صلاحية الحذف." };
  revalidatePath(`/events/${eventId}`, "layout");
  return { ok: true, message: `حُذف ${data.length}` };
}

export async function setGuestRsvp(eventId: string, guestId: string, status: string, companions = 0): Promise<ActionResult> {
  const s = z.enum(["pending", "attending", "declined"]).safeParse(status);
  if (!s.success || !uuid.safeParse(guestId).success) return { ok: false, error: "بيانات غير صحيحة" };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_guest_rsvp", {
    p_guest: guestId,
    p_status: s.data,
    p_companions: Math.max(0, Math.min(20, Math.floor(companions) || 0)),
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/events/${eventId}`, "layout");
  return { ok: true };
}

export async function markGuestSent(eventId: string, guestId: string, sent: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(guestId).success) return { ok: false, error: "مدعو غير معروف" };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("mark_guest_sent", { p_guest: guestId, p_sent: sent });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/events/${eventId}`, "layout");
  return { ok: true };
}

/** Invalidate a guest's current link and issue a new one (e.g. sent to the wrong number). */
export async function rotateGuestLink(eventId: string, guestId: string): Promise<ActionResult> {
  if (!uuid.safeParse(guestId).success) return { ok: false, error: "مدعو غير معروف" };
  const { supabase } = await requireUser();
  const { data: g } = await supabase.from("event_guests").select("token_version").eq("id", guestId).maybeSingle();
  if (!g) return { ok: false, error: "مدعو غير معروف" };
  const next = (g.token_version as number) + 1;
  const { error } = await supabase.rpc("rotate_guest_token", {
    p_guest: guestId,
    p_new_hash: guestTokenHash(guestId, next),
    p_new_version: next,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/events/${eventId}`, "layout");
  return { ok: true, message: "أُنشئ رابط جديد وأُلغي الرابط القديم" };
}
