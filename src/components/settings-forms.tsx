"use client";

import { useState, useTransition } from "react";
import { createWorkspace, deleteAccount, deleteWorkspace, renameWorkspace, updateProfile } from "@/app/(app)/settings/actions";
import { Alert, Button, Card, Field, Input } from "./ui";
import type { ActionResult } from "@/lib/errors";

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const run = (fn: () => Promise<ActionResult | void>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r) setMsg(r.ok ? { tone: "ok", text: r.message ?? "تم" } : { tone: "error", text: r.error });
    });
  return { pending, msg, run };
}

export function SettingsForms({ fullName, workspaceName, isOwner }: { fullName: string; workspaceName: string; isOwner: boolean }) {
  const [name, setName] = useState(fullName);
  const [wsName, setWsName] = useState(workspaceName);
  const [newWs, setNewWs] = useState("");
  const [confirmWs, setConfirmWs] = useState("");
  const [confirmAcc, setConfirmAcc] = useState("");
  const a = useAction();
  const b = useAction();
  const c = useAction();
  const d = useAction();
  const e = useAction();

  return (
    <>
      <Card className="space-y-3">
        <Field label="اسمك" htmlFor="full-name" hint="يُقترح كاسم صاحب الدعوة في المناسبات الجديدة">
          <Input id="full-name" value={name} onChange={(ev) => setName(ev.target.value)} />
        </Field>
        <Button size="sm" disabled={a.pending} onClick={() => a.run(() => updateProfile(name))}>
          حفظ
        </Button>
        {a.msg ? <Alert tone={a.msg.tone}>{a.msg.text}</Alert> : null}
      </Card>

      {isOwner ? (
        <Card className="space-y-3">
          <Field label="اسم مساحة العمل" htmlFor="ws-name">
            <Input id="ws-name" value={wsName} onChange={(ev) => setWsName(ev.target.value)} />
          </Field>
          <Button size="sm" disabled={b.pending} onClick={() => b.run(() => renameWorkspace(wsName))}>
            حفظ
          </Button>
          {b.msg ? <Alert tone={b.msg.tone}>{b.msg.text}</Alert> : null}
        </Card>
      ) : null}

      <Card className="space-y-3">
        <Field label="مساحة عمل جديدة" htmlFor="new-ws" hint="مثلًا لجهة أو فريق منفصل ببيانات مستقلة">
          <Input id="new-ws" value={newWs} onChange={(ev) => setNewWs(ev.target.value)} placeholder="اسم المساحة" />
        </Field>
        <Button size="sm" variant="secondary" disabled={c.pending || !newWs.trim()} onClick={() => c.run(() => createWorkspace(newWs))}>
          إنشاء
        </Button>
        {c.msg ? <Alert tone={c.msg.tone}>{c.msg.text}</Alert> : null}
      </Card>

      <Card className="space-y-4 border-no/30">
        <h2 className="font-bold text-no">منطقة الحذف</h2>
        {isOwner ? (
          <div className="space-y-2">
            <Field label={`حذف المساحة «${workspaceName}» بكل مناسباتها ومدعويها`} htmlFor="del-ws" hint="اكتب اسم المساحة للتأكيد">
              <Input id="del-ws" value={confirmWs} onChange={(ev) => setConfirmWs(ev.target.value)} />
            </Field>
            <Button size="sm" variant="danger" disabled={d.pending} onClick={() => d.run(() => deleteWorkspace(confirmWs))}>
              حذف المساحة نهائيًا
            </Button>
            {d.msg ? <Alert tone={d.msg.tone}>{d.msg.text}</Alert> : null}
          </div>
        ) : null}
        <div className="space-y-2">
          <Field label="حذف حسابي وكل بياناتي" htmlFor="del-acc" hint="اكتب «حذف» للتأكيد. لا يمكن التراجع.">
            <Input id="del-acc" value={confirmAcc} onChange={(ev) => setConfirmAcc(ev.target.value)} />
          </Field>
          <Button size="sm" variant="danger" disabled={e.pending} onClick={() => e.run(() => deleteAccount(confirmAcc))}>
            حذف الحساب
          </Button>
          {e.msg ? <Alert tone={e.msg.tone}>{e.msg.text}</Alert> : null}
        </div>
      </Card>
    </>
  );
}
