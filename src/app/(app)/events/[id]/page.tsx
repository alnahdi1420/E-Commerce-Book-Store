import type { Metadata } from "next";
import Link from "next/link";
import { requireEvent } from "@/lib/session";
import { loadGuests } from "@/lib/guests";
import { formatDate, formatHijri, formatTime } from "@/lib/dates";
import { eventStatusLabel, responseRate, type Stats } from "@/lib/status";
import { Badge, Card, LinkButton, buttonClass } from "@/components/ui";
import { GuestList } from "@/components/guest-list";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata: Metadata = { title: "المناسبة" };

export default async function EventPage(props: PageProps<"/events/[id]">) {
  const { id } = await props.params;
  const { supabase, event, canEdit } = await requireEvent(id);
  const [guests, { data: statsRow }] = await Promise.all([
    loadGuests(supabase, id, canEdit),
    supabase.from("event_stats").select("*").eq("event_id", id).maybeSingle(),
  ]);
  const s = (statsRow ?? { total: 0, attending: 0, declined: 0, pending: 0, not_sent: 0, opened: 0, sent: 0, expected_people: 0 }) as Stats;
  const st = eventStatusLabel(event.status, event.starts_at);
  const rate = responseRate(s);
  const companionsTotal = s.expected_people - s.attending;

  const cards = [
    { label: "إجمالي المدعوين", value: s.total, tone: "text-ink" },
    { label: "سيحضر", value: s.attending, tone: "text-ok" },
    { label: "اعتذر", value: s.declined, tone: "text-no" },
    { label: "بانتظار الرد", value: s.pending, tone: "text-wait" },
    { label: "نسبة الاستجابة", value: `${rate}٪`, tone: "text-brand" },
  ];

  return (
    <div className="space-y-6">
      <LiveRefresh eventId={id} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {formatDate(event.starts_at, event.timezone)} · {formatTime(event.starts_at, event.timezone)}
            <span className="mx-1">·</span>
            {formatHijri(event.starts_at, event.timezone)}
          </p>
          {event.location_name || event.location_url ? (
            <p className="mt-1 text-sm">
              {event.location_name ?? ""}
              {event.location_url ? (
                <a href={event.location_url} target="_blank" rel="noopener noreferrer" className="ms-2 font-semibold text-brand underline">
                  عرض الموقع
                </a>
              ) : null}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="no-print flex flex-wrap gap-2">
            <LinkButton href={`/events/${id}/send`} variant="whatsapp">
              إرسال الدعوات
            </LinkButton>
            <LinkButton href={`/events/${id}/guests`} variant="secondary">
              المدعوون
            </LinkButton>
            <LinkButton href={`/events/${id}/edit`} variant="secondary">
              التفاصيل
            </LinkButton>
          </div>
        ) : null}
      </div>

      <section aria-label="الإحصائيات" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label} className="p-3 sm:p-4">
            <p className="text-xs text-ink-2">{c.label}</p>
            <p className={`mt-1 text-3xl font-bold ${c.tone}`}>{c.value}</p>
          </Card>
        ))}
      </section>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">العدد المتوقع للحضور</h2>
          <p className="text-sm text-ink-2">
            <b className="text-2xl text-ink">{s.expected_people}</b> شخصًا
            {event.max_companions > 0 ? ` (${s.attending} مدعو + ${companionsTotal} مرافق)` : ""}
            {event.capacity ? ` من ${event.capacity} مقعد` : ""}
          </p>
        </div>
        {s.total > 0 ? (
          <div className="space-y-2" aria-hidden>
            <div className="flex h-4 overflow-hidden rounded-full bg-surface-2">
              <div className="bg-ok" style={{ width: `${(s.attending / s.total) * 100}%` }} />
              <div className="bg-no" style={{ width: `${(s.declined / s.total) * 100}%` }} />
              <div className="bg-gold/50" style={{ width: `${(s.pending / s.total) * 100}%` }} />
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-ink-2">
              <span>■ <span className="text-ok">سيحضر</span></span>
              <span>■ <span className="text-no">اعتذر</span></span>
              <span>■ <span className="text-gold">بانتظار</span></span>
            </div>
          </div>
        ) : null}
        <p className="text-xs text-ink-2">
          حالة الإرسال: لم تُرسل {s.not_sent} · فُتح واتساب {s.opened} · أكدت إرسالها {s.sent}. نعرض فقط ما سجّلته أنت؛ لا نعرف إن وصلت الرسالة أو قُرئت.
        </p>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">الردود</h2>
          <div className="no-print flex flex-wrap gap-2 text-sm">
            <a className={buttonClass("secondary", "sm")} href={`/events/${id}/export?format=xlsx`}>
              تصدير Excel
            </a>
            <a className={buttonClass("secondary", "sm")} href={`/events/${id}/export?format=csv`}>
              CSV
            </a>
            <Link className={buttonClass("secondary", "sm")} href={`/events/${id}/print`}>
              نسخة للطباعة
            </Link>
          </div>
        </div>
        {guests.length ? (
          <GuestList eventId={id} guests={guests} canEdit={canEdit} maxCompanions={event.max_companions} />
        ) : (
          <Card className="text-center text-sm text-ink-2">
            لا يوجد مدعوون بعد.{" "}
            {canEdit ? (
              <Link className="font-semibold text-brand underline" href={`/events/${id}/guests`}>
                أضف المدعوين
              </Link>
            ) : null}
          </Card>
        )}
      </section>
    </div>
  );
}
