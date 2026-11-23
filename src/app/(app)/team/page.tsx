import type { Metadata } from "next";
import { getCurrentWorkspace, requireUser } from "@/lib/session";
import { Badge, Card, PageTitle } from "@/components/ui";
import { InviteForm, MemberRow, RevokeButton } from "@/components/team";

export const metadata: Metadata = { title: "الفريق" };

const ROLE: Record<string, string> = { owner: "مالك", organizer: "منظّم", viewer: "مشاهد" };

export default async function TeamPage() {
  const { supabase, user } = await requireUser();
  const ws = await getCurrentWorkspace();
  const isOwner = ws.role === "owner";

  const [{ data: members }, { data: invites }, { data: events }, { data: access }, { data: usage }] = await Promise.all([
    supabase.from("workspace_members").select("user_id, role, all_events, created_at").eq("workspace_id", ws.workspace_id).order("created_at"),
    isOwner
      ? supabase
          .from("workspace_invitations")
          .select("id, email, role, expires_at, accepted_at, revoked_at")
          .eq("workspace_id", ws.workspace_id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; role: string; expires_at: string }[] }),
    supabase.from("events").select("id, title").eq("workspace_id", ws.workspace_id).neq("status", "archived").order("starts_at", { ascending: false }),
    supabase.from("member_event_access").select("user_id, event_id").eq("workspace_id", ws.workspace_id),
    supabase.rpc("workspace_usage", { p_ws: ws.workspace_id }),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const u = usage as { members: number; pending_invites: number; max_members: number | null; plan_name: string } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageTitle
        title="الفريق"
        subtitle={
          <>
            {ws.name} · دورك: {ROLE[ws.role]}
            {u ? ` · الأعضاء ${u.members}${u.max_members ? ` من ${u.max_members}` : ""} (خطة ${u.plan_name})` : ""}
          </>
        }
      />
      {isOwner ? (
        <Card className="space-y-3">
          <h2 className="font-bold">دعوة عضو</h2>
          <p className="text-sm text-ink-2">
            <b>منظّم</b>: يضيف المدعوين ويرسل الدعوات ويحدّث الردود. <b>مشاهد</b>: يرى الإحصائيات وقائمة الردود فقط بدون أرقام الجوال.
          </p>
          <InviteForm events={events ?? []} />
        </Card>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-bold">الأعضاء</h2>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {(members ?? []).map((m) => {
            const p = pmap.get(m.user_id);
            return (
              <MemberRow
                key={m.user_id}
                member={{
                  user_id: m.user_id,
                  name: p?.full_name || p?.email || "عضو",
                  email: p?.email ?? "",
                  role: m.role,
                  all_events: m.all_events,
                  event_ids: (access ?? []).filter((a) => a.user_id === m.user_id).map((a) => a.event_id),
                }}
                events={events ?? []}
                canManage={isOwner && m.role !== "owner"}
                isSelf={m.user_id === user.id}
              />
            );
          })}
        </ul>
      </section>

      {isOwner && invites?.length ? (
        <section className="space-y-2">
          <h2 className="font-bold">دعوات بانتظار القبول</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-2 px-3 py-3">
                <span className="ltr flex-1 truncate text-start text-sm">{i.email}</span>
                <Badge>{ROLE[i.role]}</Badge>
                <RevokeButton id={i.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
