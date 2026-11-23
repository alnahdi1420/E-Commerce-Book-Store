import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isPlatformAdmin, requireUser } from "@/lib/session";
import { Card, PageTitle } from "@/components/ui";
import { PlanEditor, WorkspaceAdminRow } from "@/components/admin";

export const metadata: Metadata = { title: "إدارة المنصة", robots: { index: false } };

type Overview = {
  users: number;
  workspaces: number;
  events: number;
  guests: number;
  responses: number;
  plans: { id: string; name: string; max_active_events: number | null; max_guests_per_event: number | null; max_members: number | null; price_label: string | null }[];
  workspace_list: {
    id: string;
    name: string;
    plan_id: string;
    is_suspended: boolean;
    created_at: string;
    owner_email: string;
    events: number;
    active_events: number;
    guests: number;
    members: number;
  }[];
};

export default async function AdminPage() {
  if (!(await isPlatformAdmin())) notFound();
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("admin_overview");
  if (error || !data) notFound();
  const o = data as Overview;

  return (
    <div className="space-y-6">
      <PageTitle title="إدارة المنصة" subtitle="منفصلة عن صلاحيات مالك مساحة العمل. تظهر لمديري المنصة فقط." />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["المستخدمون", o.users],
          ["مساحات العمل", o.workspaces],
          ["المناسبات", o.events],
          ["المدعوون", o.guests],
          ["الردود", o.responses],
        ].map(([l, v]) => (
          <Card key={String(l)} className="p-3">
            <p className="text-xs text-ink-2">{l}</p>
            <p className="text-2xl font-bold">{v}</p>
          </Card>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="font-bold">الخطط والحدود</h2>
        <p className="text-sm text-ink-2">اترك الحقل فارغًا لـ«بلا حد». الحدود تُطبّق في قاعدة البيانات مباشرة. لا يوجد تحصيل مالي مفعّل.</p>
        <div className="grid gap-3 md:grid-cols-3">
          {o.plans.map((p) => (
            <PlanEditor key={p.id} plan={p} />
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="font-bold">مساحات العمل ({o.workspace_list.length})</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2 text-ink-2">
              <tr>
                <th className="p-2 text-start">المساحة</th>
                <th className="p-2 text-start">المالك</th>
                <th className="p-2">مناسبات (نشطة)</th>
                <th className="p-2">مدعوون</th>
                <th className="p-2">أعضاء</th>
                <th className="p-2 text-start">الخطة / الحالة</th>
              </tr>
            </thead>
            <tbody>
              {o.workspace_list.map((w) => (
                <WorkspaceAdminRow key={w.id} w={w} plans={o.plans.map((p) => ({ id: p.id, name: p.name }))} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
