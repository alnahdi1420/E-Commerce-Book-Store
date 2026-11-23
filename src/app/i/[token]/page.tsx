import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { closedReason, coverUrl, getInvitation } from "@/lib/invitation";
import { formatDate, formatHijri, formatTime } from "@/lib/dates";
import { RsvpPanel } from "./rsvp-panel";

export const metadata: Metadata = {
  title: "دعوة",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const KIND_ICON: Record<string, string> = { wedding: "💍", meeting: "🤝", dinner: "🍽️", party: "🎉", other: "✉️" };

export default async function InvitationPage(props: PageProps<"/i/[token]">) {
  const { token } = await props.params;
  const inv = await getInvitation(token);

  if (!inv) {
    return (
      <Shell>
        <div className="rounded-3xl border border-line bg-surface p-8 text-center">
          <p className="text-4xl" aria-hidden>
            🔗
          </p>
          <h1 className="mt-3 text-xl font-bold">رابط الدعوة غير صالح</h1>
          <p className="mt-2 text-sm text-ink-2">قد يكون الرابط ناقصًا أو أُلغي. تواصل مع صاحب الدعوة للحصول على رابط جديد.</p>
        </div>
      </Shell>
    );
  }

  const e = inv.event;
  const reason = closedReason(inv);
  const cover = coverUrl(e.cover_path);

  return (
    <Shell>
      <article className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="max-h-[55vh] w-full bg-surface-2 object-contain" />
        ) : (
          <div className="bg-gradient-to-b from-brand-soft to-surface py-8 text-center text-5xl" aria-hidden>
            {KIND_ICON[e.kind] ?? "✉️"}
          </div>
        )}
        <div className="space-y-5 p-6 text-center">
          <div className="space-y-1">
            <p className="text-ink-2">
              حياكم الله <b className="text-ink">{inv.guest_name}</b>
            </p>
            <p className="text-sm text-ink-2">يتشرّف {e.host_name} بدعوتكم لحضور</p>
            <h1 className="text-3xl font-bold leading-snug text-brand">{e.title}</h1>
          </div>
          <div className="mx-auto h-px w-16 bg-gold" aria-hidden />
          <dl className="space-y-3 text-start">
            <Row icon="📅" label="التاريخ">
              {formatDate(e.starts_at, e.timezone)}
              <span className="block text-sm text-ink-2">{formatHijri(e.starts_at, e.timezone)}</span>
            </Row>
            <Row icon="⏰" label="الوقت">
              {formatTime(e.starts_at, e.timezone)}
            </Row>
            {e.location_name || e.location_address || e.location_url ? (
              <Row icon="📍" label="المكان">
                {[e.location_name, e.location_address].filter(Boolean).join(" – ") || "على الخريطة"}
                {e.location_url ? (
                  <a
                    href={e.location_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex h-10 w-fit items-center rounded-xl border border-line px-4 text-sm font-semibold text-brand"
                  >
                    عرض الموقع على الخريطة
                  </a>
                ) : null}
              </Row>
            ) : null}
          </dl>
          {e.description ? <p className="whitespace-pre-line text-start text-sm leading-relaxed text-ink-2">{e.description}</p> : null}

          <RsvpPanel
            token={token}
            initialStatus={inv.rsvp_status}
            initialCompanions={inv.companions}
            maxCompanions={e.max_companions}
            allowChange={e.allow_change}
            closed={reason}
            seatsLeft={e.seats_left}
            deadline={e.rsvp_deadline ? `${formatDate(e.rsvp_deadline, e.timezone)} ${formatTime(e.rsvp_deadline, e.timezone)}` : null}
          />

          {reason !== "cancelled" ? (
            <a href={`/i/${token}/ics`} className="inline-block text-sm text-ink-2 underline">
              إضافة الموعد إلى التقويم
            </a>
          ) : null}
        </div>
      </article>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6">
      {children}
      <p className="mt-6 text-center text-xs text-ink-2">
        دعوة عبر {brand.name} ·{" "}
        <a href="/privacy" className="underline">
          الخصوصية
        </a>
      </p>
    </main>
  );
}

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-surface-2/60 p-3">
      <span className="text-xl" aria-hidden>
        {icon}
      </span>
      <div>
        <dt className="text-xs text-ink-2">{label}</dt>
        <dd className="font-semibold">{children}</dd>
      </div>
    </div>
  );
}
