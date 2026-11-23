import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuestItem } from "@/components/guest-list";

const COLS = "id, name, send_status, rsvp_status, companions, response_source, responded_at, token_version, open_count, sent_at";

export type GuestRow = GuestItem & { token_version: number; open_count: number; sent_at: string | null };

/** Guests of an event. Phones are fetched via guest_phones() only when the user can edit. */
export async function loadGuests(supabase: SupabaseClient, eventId: string, withPhones: boolean): Promise<GuestRow[]> {
  const all: GuestRow[] = [];
  // Page through to support large events without hitting the API row cap.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("event_guests")
      .select(COLS)
      .eq("event_id", eventId)
      .order("created_at")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    all.push(...((data ?? []) as unknown as GuestRow[]));
    if (!data || data.length < 1000) break;
  }
  if (withPhones && all.length) {
    const phones = new Map<string, string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.rpc("guest_phones", { p_event: eventId }).range(from, from + 999);
      for (const p of (data ?? []) as { id: string; phone_e164: string }[]) phones.set(p.id, p.phone_e164);
      if (!data || data.length < 1000) break;
    }
    for (const g of all) g.phone = phones.get(g.id) ?? null;
  }
  return all;
}
