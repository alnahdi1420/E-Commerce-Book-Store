"use client";

import { useState, useTransition } from "react";
import { cloneEvent, deleteEvent, setEventStatus } from "@/app/(app)/events/actions";
import { Alert, Button, Card } from "./ui";

export function EventManage({ eventId, status }: { eventId: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string } | void>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r && !r.ok && "error" in r) setError(r.error ?? null);
    });

  return (
    <Card className="space-y-3">
      <h2 className="font-bold">إدارة المناسبة</h2>
      <div className="flex flex-wrap gap-2">
        {status === "draft" ? (
          <Button variant="secondary" disabled={pending} onClick={() => run(() => setEventStatus(eventId, "published"))}>
            نشر
          </Button>
        ) : null}
        {status !== "archived" ? (
          <Button variant="secondary" disabled={pending} onClick={() => run(() => setEventStatus(eventId, "archived"))}>
            أرشفة
          </Button>
        ) : (
          <Button variant="secondary" disabled={pending} onClick={() => run(() => setEventStatus(eventId, "published"))}>
            إلغاء الأرشفة
          </Button>
        )}
        <Button variant="secondary" disabled={pending} onClick={() => run(() => cloneEvent(eventId))}>
          استنساخ
        </Button>
        {status !== "cancelled" ? (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm("إلغاء المناسبة؟ ستظهر للمدعوين رسالة بأن المناسبة أُلغيت ولن يمكنهم الرد.")) {
                run(() => setEventStatus(eventId, "cancelled"));
              }
            }}
          >
            إلغاء المناسبة
          </Button>
        ) : (
          <Button variant="secondary" disabled={pending} onClick={() => run(() => setEventStatus(eventId, "published"))}>
            إعادة تفعيل
          </Button>
        )}
        <Button
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (confirm("حذف المناسبة نهائيًا مع جميع المدعوين والردود؟ لا يمكن التراجع.")) run(() => deleteEvent(eventId));
          }}
        >
          حذف نهائي
        </Button>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </Card>
  );
}
