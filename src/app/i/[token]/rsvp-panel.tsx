"use client";

import { useState, useTransition } from "react";
import { submitRsvp } from "./actions";
import { Alert, Button } from "@/components/ui";

type Status = "pending" | "attending" | "declined";

export function RsvpPanel({
  token,
  initialStatus,
  initialCompanions,
  maxCompanions,
  allowChange,
  closed,
  seatsLeft,
  deadline,
}: {
  token: string;
  initialStatus: Status;
  initialCompanions: number;
  maxCompanions: number;
  allowChange: boolean;
  closed: "cancelled" | "closed" | "ended" | "deadline" | null;
  seatsLeft: number | null;
  deadline: string | null;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [companions, setCompanions] = useState(initialCompanions);
  const [editing, setEditing] = useState(initialStatus === "pending");
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, start] = useTransition();

  if (closed === "cancelled") {
    return <Alert tone="warn">نعتذر، أُلغيت هذه المناسبة. شكرًا لاهتمامكم.</Alert>;
  }

  const answered = status !== "pending";
  const canAnswer = !closed && (!answered || allowChange);

  function send(next: "attending" | "declined") {
    setError(null);
    start(async () => {
      const r = await submitRsvp(token, next, next === "attending" ? companions : 0);
      if (!r.ok) return setError(r.error);
      setStatus(r.rsvp_status as Status);
      setCompanions(r.companions);
      setEditing(false);
      setJustSaved(true);
    });
  }

  return (
    <section className="space-y-3" aria-live="polite">
      {answered && !editing ? (
        <div className={`rounded-2xl p-4 ${status === "attending" ? "bg-ok-soft" : "bg-surface-2"}`}>
          <p className="text-lg font-bold">
            {status === "attending" ? "✓ سعدنا بتأكيد حضورك" : "وصلنا اعتذارك، شكرًا لك"}
          </p>
          {status === "attending" && companions > 0 ? <p className="text-sm">مع {companions} مرافق</p> : null}
          {justSaved ? <p className="mt-1 text-sm text-ink-2">حُفظ ردك ووصل لصاحب الدعوة.</p> : null}
          {canAnswer ? (
            <button className="mt-2 text-sm underline" onClick={() => setEditing(true)}>
              تعديل الرد
            </button>
          ) : null}
        </div>
      ) : null}

      {closed && !answered ? (
        <Alert tone="info">
          {closed === "deadline" ? "انتهى آخر موعد للرد على هذه الدعوة." : closed === "ended" ? "انتهت هذه المناسبة." : "أُغلق استقبال الردود."}
        </Alert>
      ) : null}

      {editing && canAnswer ? (
        <div className="space-y-3">
          {seatsLeft !== null ? <p className="text-sm text-ink-2">المقاعد المتبقية: {seatsLeft}</p> : null}
          {maxCompanions > 0 ? (
            <label className="flex items-center justify-center gap-2 text-sm">
              عدد المرافقين
              <select
                className="h-10 rounded-xl border border-line bg-surface px-3"
                value={companions}
                onChange={(e) => setCompanions(Number(e.target.value))}
              >
                {Array.from({ length: maxCompanions + 1 }, (_, i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" disabled={pending} onClick={() => send("attending")}>
              سأحضر
            </Button>
            <Button size="lg" variant="secondary" disabled={pending} onClick={() => send("declined")}>
              أعتذر
            </Button>
          </div>
          {deadline ? <p className="text-xs text-ink-2">آخر موعد للرد: {deadline}</p> : null}
          {answered ? (
            <button className="text-sm text-ink-2 underline" onClick={() => setEditing(false)}>
              إلغاء التعديل
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
    </section>
  );
}
