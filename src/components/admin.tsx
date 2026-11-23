"use client";

import { useState, useTransition } from "react";
import { savePlan, setWorkspacePlan } from "@/app/(app)/admin/actions";
import { Alert, Button, Card, Field, Input, Select } from "./ui";

type Plan = { id: string; name: string; max_active_events: number | null; max_guests_per_event: number | null; max_members: number | null; price_label: string | null };

const toNum = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.floor(Number(s))));

export function PlanEditor({ plan }: { plan: Plan }) {
  const [v, setV] = useState({
    name: plan.name,
    ev: plan.max_active_events?.toString() ?? "",
    gu: plan.max_guests_per_event?.toString() ?? "",
    me: plan.max_members?.toString() ?? "",
    price: plan.price_label ?? "",
  });
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="space-y-2">
      <p className="ltr text-start text-xs text-ink-2">{plan.id}</p>
      <Field label="الاسم">
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="المناسبات النشطة">
        <Input inputMode="numeric" value={v.ev} onChange={(e) => setV({ ...v, ev: e.target.value })} placeholder="بلا حد" />
      </Field>
      <Field label="المدعوون لكل مناسبة">
        <Input inputMode="numeric" value={v.gu} onChange={(e) => setV({ ...v, gu: e.target.value })} placeholder="بلا حد" />
      </Field>
      <Field label="أعضاء الفريق">
        <Input inputMode="numeric" value={v.me} onChange={(e) => setV({ ...v, me: e.target.value })} placeholder="بلا حد" />
      </Field>
      <Field label="وصف السعر">
        <Input value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
      </Field>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await savePlan({
              id: plan.id,
              name: v.name,
              max_active_events: toNum(v.ev),
              max_guests_per_event: toNum(v.gu),
              max_members: toNum(v.me),
              price_label: v.price.trim() || null,
            });
            setMsg(r.ok ? { tone: "ok", text: r.message ?? "تم" } : { tone: "error", text: r.error });
          })
        }
      >
        حفظ
      </Button>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
    </Card>
  );
}

export function WorkspaceAdminRow({
  w,
  plans,
}: {
  w: { id: string; name: string; plan_id: string; is_suspended: boolean; owner_email: string; events: number; active_events: number; guests: number; members: number };
  plans: { id: string; name: string }[];
}) {
  const [plan, setPlan] = useState(w.plan_id);
  const [suspended, setSuspended] = useState(w.is_suspended);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = plan !== w.plan_id || suspended !== w.is_suspended;
  return (
    <tr className="border-t border-line">
      <td className="p-2">{w.name}</td>
      <td className="ltr p-2 text-start text-xs">{w.owner_email}</td>
      <td className="p-2 text-center">
        {w.events} ({w.active_events})
      </td>
      <td className="p-2 text-center">{w.guests}</td>
      <td className="p-2 text-center">{w.members}</td>
      <td className="p-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select className="h-9 w-auto py-0" value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="الخطة">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={suspended} onChange={(e) => setSuspended(e.target.checked)} /> موقوفة
          </label>
          {dirty ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setWorkspacePlan(w.id, plan, suspended);
                  setMsg(r.ok ? "✓" : r.error);
                })
              }
            >
              حفظ
            </Button>
          ) : null}
          {msg ? <span className="text-xs">{msg}</span> : null}
        </div>
      </td>
    </tr>
  );
}
