import { formatDate, formatHijri, formatTime } from "./dates";

export type TemplateKey = "formal" | "friendly" | "short" | "custom";

export const TEMPLATE_VARS = [
  "{اسم_المدعو}",
  "{اسم_المناسبة}",
  "{التاريخ}",
  "{الوقت}",
  "{الموقع}",
  "{اسم_المنظم}",
  "{رابط_الدعوة}",
] as const;

export const TEMPLATES: Record<Exclude<TemplateKey, "custom">, { label: string; body: string }> = {
  formal: {
    label: "رسمي",
    body: `السلام عليكم ورحمة الله وبركاته
{اسم_المدعو} حفظكم الله،
يتشرّف {اسم_المنظم} بدعوتكم لحضور «{اسم_المناسبة}».

📅 {التاريخ}
⏰ {الوقت}
📍 {الموقع}

نسعد بتأكيد حضوركم من خلال الرابط:
{رابط_الدعوة}`,
  },
  friendly: {
    label: "ودّي",
    body: `هلا {اسم_المدعو} 🌷
يسعدنا تكون معنا في «{اسم_المناسبة}»

📅 {التاريخ} – {الوقت}
📍 {الموقع}

أكّد لنا حضورك من هنا 👇
{رابط_الدعوة}

{اسم_المنظم}`,
  },
  short: {
    label: "مختصر",
    body: `{اسم_المدعو}، ندعوك إلى «{اسم_المناسبة}» يوم {التاريخ} الساعة {الوقت}. للتأكيد: {رابط_الدعوة}`,
  },
};

export type TemplateEvent = {
  title: string;
  starts_at: string;
  timezone: string;
  host_name: string;
  location_name?: string | null;
  location_address?: string | null;
  location_url?: string | null;
  template_key?: string | null;
  message_template?: string | null;
};

export function templateBody(event: Pick<TemplateEvent, "template_key" | "message_template">): string {
  const key = (event.template_key ?? "formal") as TemplateKey;
  if (key === "custom" && event.message_template?.trim()) return event.message_template;
  return TEMPLATES[key === "custom" ? "formal" : key]?.body ?? TEMPLATES.formal.body;
}

export function locationText(e: Pick<TemplateEvent, "location_name" | "location_address" | "location_url">): string {
  const parts = [e.location_name, e.location_address].map((s) => s?.trim()).filter(Boolean) as string[];
  if (parts.length) return parts.join(" – ");
  return e.location_url ? "تجده على الخريطة في رابط الدعوة" : "";
}

/** Fill a template. Only the known placeholders are substituted; values are plain text. */
export function renderMessage(body: string, event: TemplateEvent, guestName: string, inviteUrl: string): string {
  const vars: Record<string, string> = {
    "{اسم_المدعو}": guestName.trim(),
    "{اسم_المناسبة}": event.title.trim(),
    "{التاريخ}": `${formatDate(event.starts_at, event.timezone)} (${formatHijri(event.starts_at, event.timezone)})`,
    "{الوقت}": formatTime(event.starts_at, event.timezone),
    "{الموقع}": locationText(event),
    "{اسم_المنظم}": event.host_name.trim(),
    "{رابط_الدعوة}": inviteUrl,
  };
  // Single pass, so values (e.g. a guest named "{رابط_الدعوة}") are never re-interpreted.
  let out = body.replace(/\{[^{}\n]{1,30}\}/gu, (m) => (m in vars ? vars[m] : m));
  // Drop decoration-only lines that became empty (e.g. a location pin with no location).
  out = out
    .split("\n")
    .filter((line) => !/^\s*(📍|📅|⏰)\s*$/u.test(line))
    .join("\n");
  // Guarantee the invitation link is present even if a custom template forgot it.
  if (!out.includes(inviteUrl)) out = `${out.trim()}\n\n${inviteUrl}`;
  return out.trim();
}
