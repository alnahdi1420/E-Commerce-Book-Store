import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireEvent } from "@/lib/session";
import { utcToZonedInputs } from "@/lib/dates";
import { EventForm } from "@/components/event-form";
import { Alert, Card, PageTitle, Stepper } from "@/components/ui";
import { CoverUpload } from "@/components/cover-upload";
import { EventManage } from "@/components/event-manage";

export const metadata: Metadata = { title: "تفاصيل المناسبة" };

export default async function EditEventPage(props: PageProps<"/events/[id]/edit">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const { event, canEdit } = await requireEvent(id);
  if (!canEdit) redirect(`/events/${id}`);
  const start = utcToZonedInputs(event.starts_at, event.timezone);
  const deadline = event.rsvp_deadline ? utcToZonedInputs(event.rsvp_deadline, event.timezone) : null;
  const coverUrl = event.cover_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-covers/${event.cover_path}`
    : null;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Stepper step={1} eventId={id} />
      <PageTitle title="تفاصيل المناسبة" subtitle={event.title} />
      {sp.cloned ? <Alert tone="ok">نُسخت المناسبة كمسودة جديدة بدون مدعوين. عدّل التاريخ ثم أضف المدعوين.</Alert> : null}
      <EventForm
        eventId={id}
        defaults={{
          title: event.title,
          date: start.date,
          time: start.time,
          timezone: event.timezone,
          location_url: event.location_url ?? "",
          location_name: event.location_name ?? "",
          location_address: event.location_address ?? "",
          host_name: event.host_name,
          description: event.description ?? "",
          kind: event.kind as "other",
          deadline_date: deadline?.date ?? "",
          deadline_time: deadline?.time ?? "",
          max_companions: event.max_companions,
          capacity: event.capacity ?? "",
          show_capacity: event.show_capacity,
          allow_change: event.allow_change,
        }}
      />
      <Card className="space-y-3">
        <h2 className="font-bold">صورة أو بطاقة الدعوة (اختياري)</h2>
        <p className="text-sm text-ink-2">تظهر في صفحة الدعوة. لا تُرفق تلقائيًا برسالة واتساب.</p>
        <CoverUpload eventId={id} workspaceId={event.workspace_id} currentUrl={coverUrl} />
      </Card>
      <EventManage eventId={id} status={event.status} />
    </div>
  );
}
