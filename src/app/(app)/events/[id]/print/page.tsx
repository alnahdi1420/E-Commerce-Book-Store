import type { Metadata } from "next";
import { requireEvent } from "@/lib/session";
import { loadGuests } from "@/lib/guests";
import { formatDate, formatTime } from "@/lib/dates";
import { RSVP_LABEL, responseRate, type Stats } from "@/lib/status";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "نسخة للطباعة" };

export default async function PrintPage(props: PageProps<"/events/[id]/print">) {
  const { id } = await props.params;
  const { supabase, event } = await requireEvent(id);
  const [guests, { data: st }] = await Promise.all([
    loadGuests(supabase, id, false),
    supabase.from("event_stats").select("*").eq("event_id", id).maybeSingle(),
  ]);
  const s = st as Stats | null;
  const order = { attending: 0, pending: 1, declined: 2 } as const;
  const sorted = [...guests].sort((a, b) => order[a.rsvp_status] - order[b.rsvp_status] || a.name.localeCompare(b.name, "ar"));

  return (
    <div className="mx-auto max-w-3xl space-y-4 bg-white p-4 text-black">
      <div className="no-print flex justify-end">
        <PrintButton />
      </div>
      <h1 className="text-2xl font-bold">{event.title}</h1>
      <p>
        {formatDate(event.starts_at, event.timezone)} · {formatTime(event.starts_at, event.timezone)} · {event.location_name ?? ""}
      </p>
      {s ? (
        <p className="text-sm">
          المدعوون {s.total} · سيحضر {s.attending} · اعتذر {s.declined} · بانتظار {s.pending} · الاستجابة {responseRate(s)}٪ · المتوقع حضورهم{" "}
          {s.expected_people}
        </p>
      ) : null}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="py-1 text-start">#</th>
            <th className="py-1 text-start">الاسم</th>
            <th className="py-1 text-start">الرد</th>
            <th className="py-1 text-start">المرافقون</th>
            <th className="py-1 text-start">✓ حضر</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((g, i) => (
            <tr key={g.id} className="border-b border-gray-300">
              <td className="py-1">{i + 1}</td>
              <td className="py-1">{g.name}</td>
              <td className="py-1">{RSVP_LABEL[g.rsvp_status].label}</td>
              <td className="py-1">{g.rsvp_status === "attending" ? g.companions : ""}</td>
              <td className="py-1">☐</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
