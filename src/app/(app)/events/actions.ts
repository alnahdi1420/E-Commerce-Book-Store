"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, getCurrentWorkspace } from "@/lib/session";
import { eventFormSchema, type EventFormInput } from "@/lib/validation";
import { zonedToUtcIso } from "@/lib/dates";
import { friendlyError, type ActionResult } from "@/lib/errors";

function toRow(v: z.output<typeof eventFormSchema>) {
  const deadline =
    v.deadline_date && /^\d{4}-\d{2}-\d{2}$/.test(v.deadline_date)
      ? zonedToUtcIso(v.deadline_date, v.deadline_time && /^\d{2}:\d{2}$/.test(v.deadline_time) ? v.deadline_time : "23:59", v.timezone)
      : null;
  return {
    title: v.title,
    starts_at: zonedToUtcIso(v.date, v.time, v.timezone),
    timezone: v.timezone,
    location_url: v.location_url,
    location_name: v.location_name,
    location_address: v.location_address,
    host_name: v.host_name,
    description: v.description,
    kind: v.kind,
    rsvp_deadline: deadline,
    max_companions: v.max_companions,
    capacity: v.capacity,
    show_capacity: v.show_capacity && v.capacity !== null,
    allow_change: v.allow_change,
  };
}

export async function createEvent(input: EventFormInput): Promise<ActionResult> {
  const parsed = eventFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  const { supabase } = await requireUser();
  const ws = await getCurrentWorkspace();
  if (ws.role === "viewer") return { ok: false, error: "دورك في هذه المساحة للمشاهدة فقط." };
  const { data, error } = await supabase
    .from("events")
    .insert({ ...toRow(parsed.data), workspace_id: ws.workspace_id })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyError(error) };
  redirect(`/events/${data.id}/guests`);
}

export async function updateEvent(eventId: string, input: EventFormInput): Promise<ActionResult> {
  const parsed = eventFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("events").update(toRow(parsed.data)).eq("id", eventId).select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "لا تملك صلاحية تعديل هذه المناسبة." };
  revalidatePath(`/events/${eventId}`);
  return { ok: true, message: "حُفظت التغييرات" };
}

const statusSchema = z.enum(["draft", "published", "archived", "cancelled"]);

export async function setEventStatus(eventId: string, status: string): Promise<ActionResult> {
  const s = statusSchema.safeParse(status);
  if (!s.success) return { ok: false, error: "حالة غير صحيحة" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("events").update({ status: s.data }).eq("id", eventId).select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "لا تملك صلاحية تعديل هذه المناسبة." };
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  return { ok: true };
}

export async function updateTemplate(eventId: string, key: string, custom: string | null): Promise<ActionResult> {
  const k = z.enum(["formal", "friendly", "short", "custom"]).safeParse(key);
  if (!k.success) return { ok: false, error: "قالب غير معروف" };
  const body = (custom ?? "").slice(0, 1500);
  if (k.data === "custom" && !body.trim()) return { ok: false, error: "اكتب نص الرسالة" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("events")
    .update({ template_key: k.data, message_template: k.data === "custom" ? body : null })
    .eq("id", eventId)
    .select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "لا تملك صلاحية تعديل هذه المناسبة." };
  revalidatePath(`/events/${eventId}/send`);
  return { ok: true, message: "حُفظ القالب" };
}

export async function cloneEvent(eventId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("clone_event", { p_event: eventId });
  if (error) return { ok: false, error: friendlyError(error) };
  redirect(`/events/${data}/edit?cloned=1`);
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("events").delete().eq("id", eventId).select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "لا تملك صلاحية حذف هذه المناسبة." };
  revalidatePath("/events");
  redirect("/events");
}

export async function saveCoverPath(eventId: string, path: string | null): Promise<ActionResult> {
  if (path !== null && !new RegExp(`^[0-9a-f-]{36}/${eventId}/[A-Za-z0-9._-]{1,80}$`).test(path)) {
    return { ok: false, error: "مسار غير صالح" };
  }
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("events").update({ cover_path: path }).eq("id", eventId).select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "لا تملك صلاحية." };
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}
