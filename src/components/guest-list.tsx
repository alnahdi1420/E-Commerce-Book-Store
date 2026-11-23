"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGuests, rotateGuestLink, setGuestRsvp, updateGuest } from "@/app/(app)/events/[id]/guests/actions";
import { formatPhone } from "@/lib/phone";
import { RSVP_LABEL, SEND_LABEL } from "@/lib/status";
import { Alert, Badge, Button, Input, Select, cx } from "./ui";

export type GuestItem = {
  id: string;
  name: string;
  phone?: string | null;
  send_status: keyof typeof SEND_LABEL;
  rsvp_status: keyof typeof RSVP_LABEL;
  companions: number;
  response_source: "guest" | "organizer" | null;
  responded_at: string | null;
};

type Filter = "all" | "attending" | "declined" | "pending" | "not_sent";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "attending", label: "سيحضر" },
  { id: "declined", label: "اعتذر" },
  { id: "pending", label: "لم يرد" },
  { id: "not_sent", label: "لم يُرسل" },
];

const PAGE = 100;

export function GuestList({
  eventId,
  guests,
  canEdit,
  maxCompanions,
}: {
  eventId: string;
  guests: GuestItem[];
  canEdit: boolean;
  maxCompanions: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: guests.length, attending: 0, declined: 0, pending: 0, not_sent: 0 };
    for (const g of guests) {
      c[g.rsvp_status]++;
      if (g.send_status === "not_started") c.not_sent++;
    }
    return c;
  }, [guests]);

  const list = useMemo(() => {
    const needle = q.trim();
    const digits = needle.replace(/\D/g, "");
    return guests.filter((g) => {
      if (filter === "not_sent" ? g.send_status !== "not_started" : filter !== "all" && g.rsvp_status !== filter) return false;
      if (!needle) return true;
      return g.name.includes(needle) || (!!digits && !!g.phone && g.phone.includes(digits));
    });
  }, [guests, filter, q]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ tone: "error", text: r.error ?? "خطأ" });
      else {
        if (r.message) setMsg({ tone: "ok", text: r.message });
        router.refresh();
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="تصفية">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => {
              setFilter(f.id);
              setLimit(PAGE);
            }}
            className={cx(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm",
              filter === f.id ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink-2",
            )}
          >
            {f.label} <span className="opacity-75">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      <Input type="search" placeholder="بحث بالاسم أو الرقم" value={q} onChange={(e) => setQ(e.target.value)} />

      {canEdit && sel.size > 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span>محدد {sel.size}</span>
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm(`حذف ${sel.size} مدعو من هذه المناسبة؟ ستتوقف روابطهم.`)) {
                run(async () => {
                  const r = await deleteGuests(eventId, [...sel]);
                  if (r.ok) setSel(new Set());
                  return r;
                });
              }
            }}
          >
            حذف من المناسبة
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            إلغاء التحديد
          </Button>
        </div>
      ) : null}
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}

      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-2">لا توجد نتائج</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {canEdit ? (
            <li className="flex items-center gap-2 bg-surface-2/50 px-3 py-1.5 text-xs text-ink-2">
              <input
                type="checkbox"
                aria-label="تحديد الكل"
                checked={list.length > 0 && list.slice(0, limit).every((g) => sel.has(g.id))}
                onChange={(e) => setSel(e.target.checked ? new Set(list.slice(0, limit).map((g) => g.id)) : new Set())}
              />
              تحديد الظاهر
            </li>
          ) : null}
          {list.slice(0, limit).map((g) => (
            <li key={g.id} className="px-3 py-3">
              {editing === g.id ? (
                <EditRow
                  g={g}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSave={(name, phone) =>
                    run(async () => {
                      const r = await updateGuest(eventId, g.id, name, phone);
                      if (r.ok) setEditing(null);
                      return r;
                    })
                  }
                />
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {canEdit ? (
                    <input
                      type="checkbox"
                      aria-label={`تحديد ${g.name}`}
                      checked={sel.has(g.id)}
                      onChange={(e) => {
                        const n = new Set(sel);
                        if (e.target.checked) n.add(g.id);
                        else n.delete(g.id);
                        setSel(n);
                      }}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{g.name}</p>
                    {g.phone ? <p className="ltr text-start text-xs text-ink-2">{formatPhone(g.phone)}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={SEND_LABEL[g.send_status].tone}>{SEND_LABEL[g.send_status].label}</Badge>
                    <Badge tone={RSVP_LABEL[g.rsvp_status].tone}>
                      {RSVP_LABEL[g.rsvp_status].label}
                      {g.rsvp_status === "attending" && g.companions ? ` +${g.companions}` : ""}
                    </Badge>
                    {g.response_source === "organizer" ? (
                      <span className="text-[11px] text-ink-2" title="سُجّل الرد يدويًا من المنظّم">
                        (يدوي)
                      </span>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <Select
                        aria-label={`تحديث رد ${g.name} يدويًا`}
                        className="h-9 w-auto py-0 text-sm"
                        value=""
                        disabled={pending}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          let companions = 0;
                          if (v === "attending" && maxCompanions > 0) {
                            const ans = prompt(`عدد المرافقين (0 إلى ${maxCompanions})`, "0");
                            companions = Math.max(0, Math.min(maxCompanions, Number(ans) || 0));
                          }
                          run(() => setGuestRsvp(eventId, g.id, v, companions));
                        }}
                      >
                        <option value="">تحديث الرد…</option>
                        <option value="attending">سيحضر</option>
                        <option value="declined">اعتذر</option>
                        <option value="pending">بانتظار الرد</option>
                      </Select>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(g.id)}>
                        تعديل
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.length > limit ? (
        <Button variant="secondary" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>
          عرض المزيد ({list.length - limit})
        </Button>
      ) : null}
      {editing && canEdit ? (
        <p className="text-xs text-ink-2">
          تغيير الرقم لا يغيّر رابط الدعوة. إن أرسلت الرابط لشخص خطأ، استخدم «رابط جديد» لإلغاء القديم.
        </p>
      ) : null}
      {editing && canEdit ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (confirm("إلغاء الرابط الحالي لهذا المدعو وإنشاء رابط جديد؟ الرابط القديم سيتوقف فورًا.")) {
              const id = editing;
              run(() => rotateGuestLink(eventId, id));
            }
          }}
        >
          رابط جديد لهذا المدعو
        </Button>
      ) : null}
    </div>
  );
}

function EditRow({
  g,
  pending,
  onSave,
  onCancel,
}: {
  g: GuestItem;
  pending: boolean;
  onSave: (name: string, phone: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(g.name);
  const [phone, setPhone] = useState(g.phone ?? "");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name, phone);
      }}
    >
      <Input className="h-9 flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label="الاسم" />
      <Input className="h-9 flex-1" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="الرقم" />
      <Button size="sm" type="submit" disabled={pending}>
        حفظ
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
        إلغاء
      </Button>
    </form>
  );
}
