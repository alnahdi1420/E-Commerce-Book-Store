"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentWorkspace, requireUser, siteUrl } from "@/lib/session";
import { randomToken } from "@/lib/tokens";
import { emailSchema } from "@/lib/validation";
import { friendlyError, type ActionResult } from "@/lib/errors";

const roleSchema = z.enum(["organizer", "viewer"]);

export async function inviteMember(input: {
  email: string;
  role: string;
  allEvents: boolean;
  eventIds: string[];
}): Promise<ActionResult<{ link: string }>> {
  const email = emailSchema.safeParse(input.email);
  const role = roleSchema.safeParse(input.role);
  const ids = z.array(z.string().uuid()).max(200).safeParse(input.eventIds);
  if (!email.success) return { ok: false, error: "بريد إلكتروني غير صحيح" };
  if (!role.success || !ids.success) return { ok: false, error: "بيانات غير صحيحة" };
  if (!input.allEvents && ids.data.length === 0) return { ok: false, error: "اختر مناسبة واحدة على الأقل أو «كل المناسبات»" };

  const { supabase } = await requireUser();
  const ws = await getCurrentWorkspace();
  if (ws.role !== "owner") return { ok: false, error: "دعوة الأعضاء متاحة لمالك المساحة فقط." };

  const { token, hash } = randomToken();
  const { error } = await supabase.from("workspace_invitations").insert({
    workspace_id: ws.workspace_id,
    email: email.data,
    role: role.data,
    all_events: input.allEvents,
    event_ids: input.allEvents ? [] : ids.data,
    token_hash: hash,
    expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
  });
  if (error) return { ok: false, error: friendlyError(error) };
  const h = await headers();
  revalidatePath("/team");
  return { ok: true, data: { link: `${siteUrl(h.get("host"), h.get("x-forwarded-proto"))}/join/${token}` } };
}

export async function revokeInvitation(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "غير معروف" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("workspace_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { ok: false, error: friendlyError(error ?? "FORBIDDEN") };
  revalidatePath("/team");
  return { ok: true };
}

export async function updateMember(userId: string, role: string, allEvents: boolean, eventIds: string[]): Promise<ActionResult> {
  const r = roleSchema.safeParse(role);
  const ids = z.array(z.string().uuid()).max(500).safeParse(eventIds);
  if (!r.success || !ids.success || !z.string().uuid().safeParse(userId).success) return { ok: false, error: "بيانات غير صحيحة" };
  const { supabase } = await requireUser();
  const ws = await getCurrentWorkspace();
  if (ws.role !== "owner") return { ok: false, error: "لا تملك صلاحية." };
  const { data, error } = await supabase
    .from("workspace_members")
    .update({ role: r.data, all_events: allEvents })
    .eq("workspace_id", ws.workspace_id)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data?.length) return { ok: false, error: friendlyError(error ?? "FORBIDDEN") };
  // Replace event scope.
  await supabase.from("member_event_access").delete().eq("workspace_id", ws.workspace_id).eq("user_id", userId);
  if (!allEvents && ids.data.length) {
    const { error: e2 } = await supabase
      .from("member_event_access")
      .insert(ids.data.map((event_id) => ({ workspace_id: ws.workspace_id, user_id: userId, event_id })));
    if (e2) return { ok: false, error: friendlyError(e2) };
  }
  revalidatePath("/team");
  return { ok: true, message: "حُفظت الصلاحيات" };
}

export async function removeMember(userId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(userId).success) return { ok: false, error: "غير معروف" };
  const { supabase, user } = await requireUser();
  const ws = await getCurrentWorkspace();
  const { data, error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", ws.workspace_id)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data?.length) return { ok: false, error: friendlyError(error ?? "FORBIDDEN") };
  if (userId === user.id) redirect("/events");
  revalidatePath("/team");
  return { ok: true };
}

export async function acceptInvitation(token: string): Promise<ActionResult> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return { ok: false, error: friendlyError("INVITE_INVALID") };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("accept_workspace_invitation", { p_token: token });
  if (error) return { ok: false, error: friendlyError(error) };
  const { cookies } = await import("next/headers");
  (await cookies()).set("ws", String(data), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/events");
}
