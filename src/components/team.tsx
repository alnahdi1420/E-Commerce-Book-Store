"use client";

import { useState, useTransition } from "react";
import { inviteMember, removeMember, revokeInvitation, updateMember } from "@/app/(app)/team/actions";
import { Alert, Badge, Button, Field, Input, Select, buttonClass } from "./ui";

type Ev = { id: string; title: string };
const ROLE: Record<string, string> = { owner: "مالك", organizer: "منظّم", viewer: "مشاهد" };

function ScopePicker({
  events,
  all,
  setAll,
  selected,
  setSelected,
}: {
  events: Ev[];
  all: boolean;
  setAll: (v: boolean) => void;
  selected: string[];
  setSelected: (v: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        كل المناسبات (الحالية والقادمة)
      </label>
      {!all ? (
        <div className="max-h-48 space-y-1 overflow-auto rounded-xl border border-line p-2">
          {events.length === 0 ? <p className="text-sm text-ink-2">لا توجد مناسبات بعد.</p> : null}
          {events.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(e.id)}
                onChange={(ev) => setSelected(ev.target.checked ? [...selected, e.id] : selected.filter((x) => x !== e.id))}
              />
              {e.title}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function InviteForm({ events }: { events: Ev[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("organizer");
  const [all, setAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  if (link) {
    return (
      <div className="space-y-3">
        <Alert tone="ok">
          أُنشئت الدعوة. أرسل هذا الرابط إلى <b className="ltr">{email}</b>. صالح 7 أيام ولمرة واحدة، ويعمل فقط بعد الدخول بنفس البريد.
        </Alert>
        <Input readOnly dir="ltr" value={link} onFocus={(e) => e.target.select()} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => {});
              setCopied(true);
            }}
          >
            {copied ? "نُسخ ✓" : "نسخ الرابط"}
          </Button>
          <a
            className={buttonClass("whatsapp")}
            target="_blank"
            rel="noopener noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent(`دعوتك للانضمام إلى فريق إدارة المناسبات:\n${link}`)}`}
          >
            مشاركة عبر واتساب
          </a>
          <Button
            variant="ghost"
            onClick={() => {
              setLink(null);
              setEmail("");
              setCopied(false);
            }}
          >
            دعوة أخرى
          </Button>
        </div>
        <p className="text-xs text-ink-2">لن يظهر هذا الرابط مرة أخرى. إن فقدته، ألغِ الدعوة وأنشئ غيرها.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await inviteMember({ email, role, allEvents: all, eventIds: selected });
          if (!r.ok) setError(r.error);
          else setLink(r.data!.link);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Field label="البريد الإلكتروني" htmlFor="inv-email">
          <Input id="inv-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="الدور" htmlFor="inv-role">
          <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="organizer">منظّم</option>
            <option value="viewer">مشاهد</option>
          </Select>
        </Field>
      </div>
      <ScopePicker events={events} all={all} setAll={setAll} selected={selected} setSelected={setSelected} />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "…" : "إنشاء رابط دعوة"}
      </Button>
    </form>
  );
}

export function MemberRow({
  member,
  events,
  canManage,
  isSelf,
}: {
  member: { user_id: string; name: string; email: string; role: string; all_events: boolean; event_ids: string[] };
  events: Ev[];
  canManage: boolean;
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(member.role);
  const [all, setAll] = useState(member.all_events);
  const [selected, setSelected] = useState(member.event_ids);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <li className="space-y-3 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {member.name} {isSelf ? <span className="text-xs text-ink-2">(أنت)</span> : null}
          </p>
          <p className="ltr truncate text-start text-xs text-ink-2">{member.email}</p>
        </div>
        <Badge tone={member.role === "owner" ? "brand" : "muted"}>{ROLE[member.role]}</Badge>
        {member.role !== "owner" && !member.all_events ? <Badge>مناسبات محددة</Badge> : null}
        {canManage ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "إغلاق" : "الصلاحيات"}
          </Button>
        ) : null}
        {isSelf && member.role !== "owner" ? (
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => confirm("مغادرة هذه المساحة؟") && start(async () => void (await removeMember(member.user_id)))}
          >
            مغادرة
          </Button>
        ) : null}
      </div>
      {open && canManage ? (
        <div className="space-y-3 rounded-xl bg-surface-2/60 p-3">
          <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="الدور">
            <option value="organizer">منظّم</option>
            <option value="viewer">مشاهد</option>
          </Select>
          <ScopePicker events={events} all={all} setAll={setAll} selected={selected} setSelected={setSelected} />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await updateMember(member.user_id, role, all, selected);
                  setMsg(r.ok ? { tone: "ok", text: r.message ?? "تم" } : { tone: "error", text: r.error });
                })
              }
            >
              حفظ
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => {
                if (confirm(`إزالة ${member.name} من الفريق؟`)) {
                  start(async () => {
                    const r = await removeMember(member.user_id);
                    if (!r.ok) setMsg({ tone: "error", text: r.error });
                  });
                }
              }}
            >
              إزالة من الفريق
            </Button>
          </div>
          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
        </div>
      ) : null}
    </li>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => void (await revokeInvitation(id)))}>
      إلغاء
    </Button>
  );
}
