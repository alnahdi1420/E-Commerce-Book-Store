import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "organizer" | "viewer";
export type Membership = { workspace_id: string; role: Role; all_events: boolean; name: string };

export const WS_COOKIE = "ws";

/** The signed-in user (validated with the auth server), or a redirect to /login. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { supabase, user: data.user };
});

export const getMemberships = cache(async (): Promise<Membership[]> => {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, all_events, workspaces(name)")
    .eq("user_id", user.id)
    .order("created_at");
  return (data ?? []).map((m) => ({
    workspace_id: m.workspace_id as string,
    role: m.role as Role,
    all_events: m.all_events as boolean,
    name: ((m.workspaces as unknown as { name: string } | null)?.name ?? "") as string,
  }));
});

/** Current workspace: from cookie if the user is still a member, otherwise their first (own) workspace. */
export const getCurrentWorkspace = cache(async (): Promise<Membership> => {
  const memberships = await getMemberships();
  if (!memberships.length) redirect("/login?error=no_workspace");
  const jar = await cookies();
  const wanted = jar.get(WS_COOKIE)?.value;
  return (
    memberships.find((m) => m.workspace_id === wanted) ??
    memberships.find((m) => m.role === "owner") ??
    memberships[0]
  );
});

export const isPlatformAdmin = cache(async () => {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
});

export type EventRow = {
  id: string;
  workspace_id: string;
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
  capacity: number | null;
  show_capacity: boolean;
  allow_change: boolean;
  status: "draft" | "published" | "archived" | "cancelled";
  template_key: string;
  message_template: string | null;
  created_at: string;
};

/** Load an event the user can see (RLS) and compute whether they may edit it. 404 otherwise. */
export async function requireEvent(eventId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) notFound();
  const { supabase, user } = await requireUser();
  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle<EventRow>();
  if (!event) notFound();
  const { data: canEdit } = await supabase.rpc("can_edit_event", { p_event: eventId });
  const memberships = await getMemberships();
  const role = memberships.find((m) => m.workspace_id === event.workspace_id)?.role ?? "viewer";
  return { supabase, user, event, canEdit: canEdit === true, role };
}

export function siteUrl(headersHost?: string | null, proto?: string | null): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  if (headersHost) return `${proto ?? "https"}://${headersHost}`;
  return "http://localhost:3000";
}
