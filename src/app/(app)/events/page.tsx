import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentWorkspace, requireUser } from "@/lib/session";
import { Badge, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/dates";
import { eventStatusLabel, responseRate, type EventStatus, type Stats } from "@/lib/status";

export const metadata: Metadata = { title: "مناسباتي" };

export default async function EventsPage(props: PageProps<"/events">) {
  const sp = await props.searchParams;
  const showArchived = sp.archived === "1";
  const { supabase } = await requireUser();
  const ws = await getCurrentWorkspace();

  let q = supabase
    .from("events")
    .select("id, title, starts_at, timezone, status, location_name")
    .eq("workspace_id", ws.workspace_id)
    .order("starts_at", { ascending: false })
    .limit(200);
  q = showArchived ? q.eq("status", "archived") : q.neq("status", "archived");
  const [{ data: events }, { data: stats }] = await Promise.all([
    q,
    supabase.from("event_stats").select("*").eq("workspace_id", ws.workspace_id),
  ]);
  const statsBy = new Map((stats ?? []).map((s) => [s.event_id as string, s as unknown as Stats]));
  const canCreate = ws.role !== "viewer";

  return (
    <div className="space-y-5">
      <PageTitle
        title={showArchived ? "المناسبات المؤرشفة" : "مناسباتي"}
        actions={
          canCreate ? (
            <LinkButton href="/events/new" size="lg">
              + مناسبة جديدة
            </LinkButton>
          ) : null
        }
      />
      {!events?.length ? (
        showArchived ? (
          <EmptyState title="لا توجد مناسبات مؤرشفة" />
        ) : (
          <EmptyState
            title="لا توجد مناسبات بعد"
            action={canCreate ? <LinkButton href="/events/new">أنشئ مناسبتك الأولى</LinkButton> : null}
          >
            أنشئ مناسبة، أضف المدعوين، وأرسل الدعوات من واتسابك خلال دقائق.
          </EmptyState>
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {events.map((e) => {
            const s = statsBy.get(e.id);
            const st = eventStatusLabel(e.status as EventStatus, e.starts_at);
            return (
              <li key={e.id}>
                <Link
                  href={`/events/${e.id}`}
                  className="block rounded-2xl border border-line bg-surface p-4 transition hover:border-brand/40 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-bold leading-snug">{e.title}</h2>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-2">
                    {formatDate(e.starts_at, e.timezone)} · {formatTime(e.starts_at, e.timezone)}
                  </p>
                  {s && s.total > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-sm">
                      <Badge tone="ok">سيحضر {s.attending}</Badge>
                      <Badge tone="no">اعتذر {s.declined}</Badge>
                      <Badge tone="wait">بانتظار {s.pending}</Badge>
                      <span className="text-ink-2">
                        من {s.total} · استجابة {responseRate(s)}٪
                      </span>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-ink-2">لم يُضف مدعوون بعد</p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="text-center text-sm">
        <Link className="text-ink-2 underline" href={showArchived ? "/events" : "/events?archived=1"}>
          {showArchived ? "العودة إلى المناسبات الحالية" : "عرض المؤرشفة"}
        </Link>
      </div>
    </div>
  );
}
