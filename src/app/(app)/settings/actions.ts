"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { getCurrentWorkspace, requireUser, WS_COOKIE } from "@/lib/session";
import { friendlyError, type ActionResult } from "@/lib/errors";

export async function updateProfile(fullName: string): Promise<ActionResult> {
  const n = fullName.trim().slice(0, 80);
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update({ full_name: n || null }).eq("id", user.id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/settings");
  return { ok: true, message: "حُفظ" };
}

export async function renameWorkspace(name: string): Promise<ActionResult> {
  const n = name.trim();
  if (!n || n.length > 80) return { ok: false, error: "اكتب اسمًا صحيحًا" };
  const { supabase } = await requireUser();
  const ws = await getCurrentWorkspace();
  const { data, error } = await supabase.from("workspaces").update({ name: n }).eq("id", ws.workspace_id).select("id");
  if (error || !data?.length) return { ok: false, error: friendlyError(error ?? "FORBIDDEN") };
  revalidatePath("/", "layout");
  return { ok: true, message: "حُفظ" };
}

export async function createWorkspace(name: string): Promise<ActionResult> {
  const n = name.trim();
  if (!n || n.length > 80) return { ok: false, error: "اكتب اسمًا صحيحًا" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_workspace", { p_name: n });
  if (error) return { ok: false, error: friendlyError(error) };
  (await cookies()).set(WS_COOKIE, String(data), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/events");
}

/** Owner deletes the current workspace with all its events, guests and responses. */
export async function deleteWorkspace(confirmName: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const ws = await getCurrentWorkspace();
  if (ws.role !== "owner") return { ok: false, error: "الحذف متاح للمالك فقط." };
  if (confirmName.trim() !== ws.name) return { ok: false, error: "اكتب اسم المساحة كما هو للتأكيد." };
  const { count } = await supabase.from("workspaces").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
  if ((count ?? 0) <= 1) return { ok: false, error: "هذه مساحتك الوحيدة. لحذف كل بياناتك استخدم «حذف الحساب»." };
  const { error } = await supabase.from("workspaces").delete().eq("id", ws.workspace_id);
  if (error) return { ok: false, error: friendlyError(error) };
  (await cookies()).delete(WS_COOKIE);
  redirect("/events");
}

/**
 * Deletes the auth user; cascades remove their profile, owned workspaces, events, guests and responses.
 * Requires SUPABASE_SERVICE_ROLE_KEY on the server (never exposed to the browser).
 */
export async function deleteAccount(confirmText: string): Promise<ActionResult> {
  if (confirmText.trim() !== "حذف") return { ok: false, error: "اكتب كلمة «حذف» للتأكيد." };
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { ok: false, error: "حذف الحساب غير مفعّل على هذا الخادم بعد. تواصل مع الدعم لحذف بياناتك." };
  const { supabase, user } = await requireUser();
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, error: "تعذّر حذف الحساب. حاول لاحقًا." };
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
