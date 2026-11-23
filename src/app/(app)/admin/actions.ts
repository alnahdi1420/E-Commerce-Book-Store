"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { friendlyError, type ActionResult } from "@/lib/errors";

const lim = z.union([z.null(), z.number().int().min(0).max(1_000_000)]);

export async function savePlan(input: {
  id: string;
  name: string;
  max_active_events: number | null;
  max_guests_per_event: number | null;
  max_members: number | null;
  price_label: string | null;
}): Promise<ActionResult> {
  const p = z
    .object({
      id: z.string().regex(/^[a-z0-9_-]{2,32}$/),
      name: z.string().trim().min(1).max(40),
      max_active_events: lim,
      max_guests_per_event: lim,
      max_members: z.union([z.null(), z.number().int().min(1).max(10000)]),
      price_label: z.string().trim().max(40).nullable(),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, error: "قيم غير صحيحة" };
  const { supabase } = await requireUser();
  // admin_* RPCs re-check is_platform_admin() inside the database.
  const { error } = await supabase.rpc("admin_update_plan", {
    p_id: p.data.id,
    p_name: p.data.name,
    p_max_events: p.data.max_active_events,
    p_max_guests: p.data.max_guests_per_event,
    p_max_members: p.data.max_members,
    p_price_label: p.data.price_label,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin");
  return { ok: true, message: "حُفظت الخطة" };
}

export async function setWorkspacePlan(workspaceId: string, planId: string, suspended: boolean): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(workspaceId).success) return { ok: false, error: "غير معروف" };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("admin_set_workspace", { p_ws: workspaceId, p_plan: planId, p_suspended: suspended });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin");
  return { ok: true, message: "حُفظ" };
}
