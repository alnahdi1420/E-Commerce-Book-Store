import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireEvent } from "@/lib/session";
import { loadGuests } from "@/lib/guests";
import { Card, LinkButton, PageTitle, Stepper } from "@/components/ui";
import { GuestAdder } from "@/components/guest-adder";
import { GuestList } from "@/components/guest-list";

export const metadata: Metadata = { title: "المدعوون" };

export default async function GuestsPage(props: PageProps<"/events/[id]/guests">) {
  const { id } = await props.params;
  const { supabase, event, canEdit } = await requireEvent(id);
  if (!canEdit) redirect(`/events/${id}`);
  const [guests, { data: contacts }] = await Promise.all([
    loadGuests(supabase, id, true),
    supabase.from("contacts").select("id, name, phone_e164").eq("workspace_id", event.workspace_id).order("name").limit(2000),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Stepper step={2} eventId={id} />
      <PageTitle
        title="المدعوون"
        subtitle={`${event.title} · ${guests.length} مدعو`}
        actions={
          guests.length ? (
            <LinkButton href={`/events/${id}/send`} size="lg">
              التالي: إرسال ←
            </LinkButton>
          ) : null
        }
      />
      <Card>
        <GuestAdder eventId={id} existingPhones={guests.map((g) => g.phone!).filter(Boolean)} contacts={contacts ?? []} />
      </Card>
      {guests.length ? <GuestList eventId={id} guests={guests} canEdit maxCompanions={event.max_companions} /> : null}
    </div>
  );
}
