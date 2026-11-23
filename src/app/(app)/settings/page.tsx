import type { Metadata } from "next";
import { getCurrentWorkspace, requireUser } from "@/lib/session";
import { Card, PageTitle, buttonClass } from "@/components/ui";
import { SettingsForms } from "@/components/settings-forms";

export const metadata: Metadata = { title: "الإعدادات" };

type Usage = {
  plan_name: string;
  max_active_events: number | null;
  max_guests_per_event: number | null;
  max_members: number | null;
  active_events: number;
  members: number;
  total_guests: number;
};

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const ws = await getCurrentWorkspace();
  const [{ data: profile }, { data: usage }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.rpc("workspace_usage", { p_ws: ws.workspace_id }),
  ]);
  const u = usage as Usage | null;
  const lim = (n: number | null) => (n === null ? "بلا حد" : n);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle title="الإعدادات" subtitle={<span className="ltr">{user.email}</span>} />
      {u ? (
        <Card className="space-y-2">
          <h2 className="font-bold">الخطة: {u.plan_name}</h2>
          <ul className="space-y-1 text-sm text-ink-2">
            <li>
              المناسبات النشطة: {u.active_events} من {lim(u.max_active_events)}
            </li>
            <li>الحد الأقصى للمدعوين في المناسبة: {lim(u.max_guests_per_event)}</li>
            <li>
              أعضاء الفريق: {u.members} من {lim(u.max_members)}
            </li>
          </ul>
          <p className="text-xs text-ink-2">الخطط المدفوعة غير متاحة للشراء بعد. لا نطلب أي بيانات دفع.</p>
        </Card>
      ) : null}
      <SettingsForms fullName={profile?.full_name ?? ""} workspaceName={ws.name} isOwner={ws.role === "owner"} />
      <Card className="space-y-2">
        <h2 className="font-bold">بياناتك</h2>
        <p className="text-sm text-ink-2">نزّل نسخة من بياناتك (المناسبات والمدعوين والردود في المساحات التي تملكها).</p>
        <a className={buttonClass("secondary")} href="/settings/export">
          تنزيل بياناتي
        </a>
      </Card>
    </div>
  );
}
