"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markGuestSent } from "@/app/(app)/events/[id]/guests/actions";
import { updateTemplate } from "@/app/(app)/events/actions";
import { renderMessage, templateBody, TEMPLATES, TEMPLATE_VARS, type TemplateEvent, type TemplateKey } from "@/lib/templates";
import { whatsappLink } from "@/lib/whatsapp";
import { formatPhone } from "@/lib/phone";
import { RSVP_LABEL, SEND_LABEL } from "@/lib/status";
import { Alert, Badge, Button, Card, Textarea, buttonClass, cx } from "./ui";

type SendGuest = {
  id: string;
  name: string;
  phone: string;
  send_status: keyof typeof SEND_LABEL;
  rsvp_status: keyof typeof RSVP_LABEL;
  inviteUrl: string;
};

export function SendBoard({
  eventId,
  event,
  eventStatus,
  guests: initial,
}: {
  eventId: string;
  event: TemplateEvent;
  eventStatus: string;
  guests: SendGuest[];
}) {
  const router = useRouter();
  const [guests, setGuests] = useState(initial);
  // Re-sync local optimistic state when the server sends fresh data (router.refresh()).
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setGuests(initial);
  }
  const [mode, setMode] = useState<"sequence" | "list">("sequence");
  const [awaiting, setAwaiting] = useState<string | null>(null); // guest whose chat was opened, waiting for confirmation
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [tplKey, setTplKey] = useState<TemplateKey>((event.template_key as TemplateKey) ?? "formal");
  const [custom, setCustom] = useState(event.message_template ?? TEMPLATES.formal.body);
  const body = tplKey === "custom" ? custom : templateBody({ template_key: tplKey });
  const savedBody = templateBody(event);
  const dirty = body !== savedBody || tplKey !== event.template_key;

  const messageFor = (g: SendGuest) => renderMessage(body, event, g.name, g.inviteUrl);

  const sentCount = guests.filter((g) => g.send_status === "sent").length;
  const queue = useMemo(() => guests.filter((g) => g.send_status !== "sent" && !skipped.has(g.id)), [guests, skipped]);
  const current = awaiting ? guests.find((g) => g.id === awaiting) : queue[0];

  function patch(id: string, p: Partial<SendGuest>) {
    setGuests((gs) => gs.map((g) => (g.id === id ? { ...g, ...p } : g)));
  }

  function openWhatsApp(g: SendGuest, e: React.MouseEvent<HTMLAnchorElement>) {
    if (dirty) {
      e.preventDefault();
      setError("احفظ تعديل نص الرسالة أولًا حتى يصل للمدعوين النص الذي تراه.");
      return;
    }
    if (g.send_status === "sent" && !confirm(`سبق أن أكدت إرسال الدعوة إلى ${g.name}. فتح المحادثة مرة أخرى؟`)) {
      e.preventDefault();
      return;
    }
    // Record "opened" without blocking navigation. This is NOT proof of sending.
    void fetch(`/api/guests/${g.id}/opened`, { method: "POST", keepalive: true }).catch(() => {});
    if (g.send_status === "not_started") patch(g.id, { send_status: "opened" });
    setAwaiting(g.id);
  }

  function confirmSent(g: SendGuest, sent: boolean) {
    setError(null);
    start(async () => {
      if (sent) {
        const r = await markGuestSent(eventId, g.id, true);
        if (!r.ok) return setError(r.error);
        patch(g.id, { send_status: "sent" });
      }
      setAwaiting(null);
      if (!sent) setSkipped((s) => new Set(s).add(g.id));
      router.refresh();
    });
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("تعذّر النسخ. انسخ النص يدويًا.");
    }
  }

  return (
    <div className="space-y-5">
      <Alert tone="info">
        يفتح زر «فتح واتساب» محادثة المدعو برسالة جاهزة في واتساب المفتوح على جهازك. <b>أنت من يضغط إرسال</b> داخل واتساب، ثم ارجع هنا وأكّد.
        لا نرسل شيئًا تلقائيًا ولا نطّلع على محادثاتك.
      </Alert>
      {eventStatus === "cancelled" ? <Alert tone="warn">هذه المناسبة ملغاة؛ سيرى المدعوون أنها أُلغيت.</Alert> : null}

      <TemplateEditor
        tplKey={tplKey}
        setTplKey={setTplKey}
        custom={custom}
        setCustom={setCustom}
        preview={guests[0] ? messageFor(guests[0]) : ""}
        dirty={dirty}
        onSave={() =>
          start(async () => {
            setError(null);
            const r = await updateTemplate(eventId, tplKey, tplKey === "custom" ? custom : null);
            if (!r.ok) setError(r.error);
            else router.refresh();
          })
        }
        pending={pending}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          أكدت إرسال <b className="text-ink">{sentCount}</b> من {guests.length}
        </p>
        <div className="flex rounded-xl bg-surface-2 p-1 text-sm">
          {(["sequence", "list"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cx("rounded-lg px-3 py-1.5 font-semibold", mode === m ? "bg-surface shadow-sm" : "text-ink-2")}>
              {m === "sequence" ? "إرسال متتابع" : "القائمة"}
            </button>
          ))}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full bg-brand transition-all" style={{ width: `${guests.length ? (sentCount / guests.length) * 100 : 0}%` }} />
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}

      {mode === "sequence" ? (
        current ? (
          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-ink-2">{awaiting ? "بانتظار تأكيدك" : `التالي · بقي ${queue.length}`}</p>
                <p className="text-xl font-bold">{current.name}</p>
                <p className="ltr text-start text-sm text-ink-2">{formatPhone(current.phone)}</p>
              </div>
              <Badge tone={SEND_LABEL[current.send_status].tone}>{SEND_LABEL[current.send_status].label}</Badge>
            </div>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-sm leading-relaxed">{messageFor(current)}</pre>
            {awaiting === current.id ? (
              <div className="space-y-2">
                <p className="font-semibold">هل أرسلت الدعوة إلى {current.name}؟</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="lg" disabled={pending} onClick={() => confirmSent(current, true)}>
                    نعم، أرسلتها ← التالي
                  </Button>
                  <Button size="lg" variant="secondary" disabled={pending} onClick={() => confirmSent(current, false)}>
                    لم أرسلها
                  </Button>
                </div>
                <a href={whatsappLink(current.phone, messageFor(current))} target="_blank" rel="noopener noreferrer" className="block text-center text-sm text-ink-2 underline">
                  فتح المحادثة مرة أخرى
                </a>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <a
                  href={whatsappLink(current.phone, messageFor(current))}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => openWhatsApp(current, e)}
                  className={buttonClass("whatsapp", "lg")}
                >
                  فتح واتساب
                </a>
                <Button variant="secondary" onClick={() => copy(messageFor(current), "msg-" + current.id)}>
                  {copied === "msg-" + current.id ? "نُسخ ✓" : "نسخ النص"}
                </Button>
                <Button variant="ghost" onClick={() => setSkipped((s) => new Set(s).add(current.id))}>
                  تخطَّ
                </Button>
              </div>
            )}
          </Card>
        ) : (
          <Card className="space-y-2 text-center">
            <p className="text-lg font-bold">{skipped.size ? "انتهت القائمة" : "أُرسلت جميع الدعوات 🎉"}</p>
            {skipped.size ? (
              <Button variant="secondary" onClick={() => setSkipped(new Set())}>
                الرجوع إلى المتخطَّين ({skipped.size})
              </Button>
            ) : (
              <p className="text-sm text-ink-2">تابع الردود من صفحة المناسبة.</p>
            )}
          </Card>
        )
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {guests.map((g) => (
            <li key={g.id} className="space-y-2 px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{g.name}</p>
                  <p className="ltr text-start text-xs text-ink-2">{formatPhone(g.phone)}</p>
                </div>
                <Badge tone={SEND_LABEL[g.send_status].tone}>{SEND_LABEL[g.send_status].label}</Badge>
                <Badge tone={RSVP_LABEL[g.rsvp_status].tone}>{RSVP_LABEL[g.rsvp_status].label}</Badge>
              </div>
              {awaiting === g.id ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-info-soft p-2">
                  <span className="text-sm font-semibold">هل أرسلتها؟</span>
                  <Button size="sm" disabled={pending} onClick={() => confirmSent(g, true)}>
                    أرسلت الدعوة
                  </Button>
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => setAwaiting(null)}>
                    لم أرسلها
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <a
                    href={whatsappLink(g.phone, messageFor(g))}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => openWhatsApp(g, e)}
                    className={buttonClass("whatsapp", "sm")}
                  >
                    {g.send_status === "sent" ? "إعادة الإرسال" : "فتح واتساب"}
                  </a>
                  <Button size="sm" variant="secondary" onClick={() => copy(messageFor(g), "msg-" + g.id)}>
                    {copied === "msg-" + g.id ? "نُسخ ✓" : "نسخ النص"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => copy(g.inviteUrl, "url-" + g.id)}>
                    {copied === "url-" + g.id ? "نُسخ ✓" : "نسخ الرابط"}
                  </Button>
                  {g.send_status !== "sent" ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirmSent(g, true)}>
                      أرسلتها بطريقة أخرى
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await markGuestSent(eventId, g.id, false);
                          if (r.ok) patch(g.id, { send_status: "opened" });
                          router.refresh();
                        })
                      }
                    >
                      تراجع عن «أُرسلت»
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplateEditor({
  tplKey,
  setTplKey,
  custom,
  setCustom,
  preview,
  dirty,
  onSave,
  pending,
}: {
  tplKey: TemplateKey;
  setTplKey: (k: TemplateKey) => void;
  custom: string;
  setCustom: (s: string) => void;
  preview: string;
  dirty: boolean;
  onSave: () => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button className="flex w-full items-center justify-between px-4 py-3 font-semibold" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>
          نص الرسالة: {tplKey === "custom" ? "مخصص" : TEMPLATES[tplKey].label}
          {dirty ? <span className="ms-2 text-xs text-wait">(غير محفوظ)</span> : null}
        </span>
        <span className="text-ink-2">{open ? "−" : "تغيير"}</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-line p-4">
          <div className="flex flex-wrap gap-2">
            {(["formal", "friendly", "short"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTplKey(k)}
                className={cx("rounded-full border px-3 py-1.5 text-sm", tplKey === k ? "border-brand bg-brand-soft text-brand" : "border-line")}
              >
                {TEMPLATES[k].label}
              </button>
            ))}
            <button
              onClick={() => {
                if (tplKey !== "custom") setCustom(templateBody({ template_key: tplKey }));
                setTplKey("custom");
              }}
              className={cx("rounded-full border px-3 py-1.5 text-sm", tplKey === "custom" ? "border-brand bg-brand-soft text-brand" : "border-line")}
            >
              تحرير النص
            </button>
          </div>
          {tplKey === "custom" ? (
            <>
              <Textarea rows={9} value={custom} maxLength={1500} onChange={(e) => setCustom(e.target.value)} />
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARS.map((v) => (
                  <button key={v} type="button" className="rounded-md bg-surface-2 px-2 py-0.5 text-xs" onClick={() => setCustom(custom + (custom.endsWith(" ") || !custom ? "" : " ") + v)}>
                    {v}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <div>
            <p className="mb-1 text-xs font-semibold text-ink-2">معاينة لأول مدعو</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-sm leading-relaxed">{preview}</pre>
          </div>
          <Button onClick={onSave} disabled={pending || !dirty}>
            حفظ النص
          </Button>
        </div>
      ) : null}
    </div>
  );
}
