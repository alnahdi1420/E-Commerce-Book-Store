import "server-only";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { supabasePublicKey, supabaseUrl } from "@/lib/env";

export type Invitation = {
  guest_name: string;
  rsvp_status: "pending" | "attending" | "declined";
  companions: number;
  responded_at: string | null;
  event: {
    title: string;
    kind: string;
    starts_at: string;
    timezone: string;
    location_url: string | null;
    location_name: string | null;
    location_address: string | null;
    host_name: string;
    description: string | null;
    cover_path: string | null;
    rsvp_deadline: string | null;
    max_companions: number;
    allow_change: boolean;
    status: "draft" | "published" | "archived" | "cancelled";
    seats_left: number | null;
  };
};

/** Anonymous client: no cookies, no session. Only the two public RPCs are executable by anon. */
export function publicClient() {
  return createSupabase(supabaseUrl(), supabasePublicKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isTokenShape(token: string) {
  return /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

export async function getInvitation(token: string): Promise<Invitation | null> {
  if (!isTokenShape(token)) return null;
  const { data, error } = await publicClient().rpc("get_invitation", { p_token: token });
  if (error || !data) return null;
  return data as Invitation;
}

export function closedReason(inv: Invitation): "cancelled" | "closed" | "ended" | "deadline" | null {
  const e = inv.event;
  if (e.status === "cancelled") return "cancelled";
  if (e.status === "archived") return "closed";
  if (Date.now() > new Date(e.starts_at).getTime() + 6 * 3600_000) return "ended";
  if (e.rsvp_deadline && Date.now() > new Date(e.rsvp_deadline).getTime()) return "deadline";
  return null;
}

export function coverUrl(path: string | null) {
  return path ? `${supabaseUrl()}/storage/v1/object/public/event-covers/${path}` : null;
}
