import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireEvent, siteUrl } from "@/lib/session";
import { loadGuests } from "@/lib/guests";
import { guestToken } from "@/lib/tokens";
import { EmptyState, LinkButton, PageTitle, Stepper } from "@/components/ui";
import { SendBoard } from "@/components/send-board";

export const metadata: Metadata = { title: "إرسال الدعوات" };

export default async function SendPage(props: PageProps<"/events/[id]/send">) {
  const { id } = await props.params;
  const { supabase, event, canEdit } = await requireEvent(id);
  if (!canEdit) redirect(`/events/${id}`);
  const h = await headers();
  const base = siteUrl(h.get("host"), h.get("x-forwarded-proto"));
  const guests = await loadGuests(supabase, id, true);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Stepper step={3} eventId={id} />
      <PageTitle title="إرسال الدعوات" subtitle={event.title} />
      {!guests.length ? (
        <EmptyState title="لا يوجد مدعوون بعد" action={<LinkButton href={`/events/${id}/guests`}>أضف المدعوين</LinkButton>} />
      ) : (
        <SendBoard
          eventId={id}
          event={{
            title: event.title,
            starts_at: event.starts_at,
            timezone: event.timezone,
            host_name: event.host_name,
            location_name: event.location_name,
            location_address: event.location_address,
            location_url: event.location_url,
            template_key: event.template_key,
            message_template: event.message_template,
          }}
          eventStatus={event.status}
          guests={guests.map((g) => ({
            id: g.id,
            name: g.name,
            phone: g.phone ?? "",
            send_status: g.send_status,
            rsvp_status: g.rsvp_status,
            inviteUrl: `${base}/i/${guestToken(g.id, g.token_version)}`,
          }))}
        />
      )}
    </div>
  );
}
