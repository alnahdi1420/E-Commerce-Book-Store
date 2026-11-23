import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentWorkspace, requireUser } from "@/lib/session";
import { EventForm } from "@/components/event-form";
import { PageTitle, Stepper } from "@/components/ui";

export const metadata: Metadata = { title: "مناسبة جديدة" };

export default async function NewEventPage() {
  const { supabase, user } = await requireUser();
  const ws = await getCurrentWorkspace();
  if (ws.role === "viewer") redirect("/events");
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Stepper step={1} />
      <PageTitle title="مناسبة جديدة" subtitle="الحقول الأساسية فقط، ويمكنك تعديلها لاحقًا." />
      <EventForm defaults={{ host_name: profile?.full_name ?? "" }} />
    </div>
  );
}
