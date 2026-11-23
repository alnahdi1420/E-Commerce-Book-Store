"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentWorkspace, requireUser } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";
import { friendlyError, type ActionResult } from "@/lib/errors";

export async function addContact(name: string, phone: string): Promise<ActionResult> {
  const n = name.trim();
  if (!n || n.length > 100) return { ok: false, error: "اكتب الاسم" };
  const p = normalizePhone(phone);
  if (!p.ok) return { ok: false, error: p.error };
  const { supabase } = await requireUser();
  const ws = await getCurrentWorkspace();
  const { error } = await supabase
    .from("contacts")
    .upsert({ workspace_id: ws.workspace_id, name: n, phone_e164: p.e164 }, { onConflict: "workspace_id,phone_e164" });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/contacts");
  return { ok: true };
}

export async function deleteContacts(ids: string[]): Promise<ActionResult> {
  const parsed = z.array(z.string().uuid()).min(1).max(5000).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "اختر جهات" };
  const { supabase } = await requireUser();
  const ws = await getCurrentWorkspace();
  const { error } = await supabase.from("contacts").delete().eq("workspace_id", ws.workspace_id).in("id", parsed.data);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/contacts");
  return { ok: true };
}
