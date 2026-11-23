/** Translate database / auth errors into plain Arabic for end users. Never leak internals. */
const MAP: [RegExp, string][] = [
  [/PLAN_LIMIT_EVENTS/, "وصلت إلى الحد الأقصى للمناسبات النشطة في خطتك الحالية. أرشف مناسبة قديمة أو تواصل معنا للترقية."],
  [/PLAN_LIMIT_MEMBERS/, "وصلت إلى الحد الأقصى لأعضاء الفريق في خطتك الحالية."],
  [/PLAN_LIMIT_GUESTS|plan_limit/, "وصلت إلى الحد الأقصى لعدد المدعوين في هذه المناسبة حسب خطتك."],
  [/INVITE_EMAIL_MISMATCH/, "هذه الدعوة مرسلة إلى بريد إلكتروني آخر. سجّل الدخول بالبريد الذي وصلته الدعوة."],
  [/INVITE_INVALID/, "رابط الانضمام غير صالح أو انتهت صلاحيته أو استُخدم من قبل."],
  [/RATE_LIMITED/, "محاولات كثيرة خلال وقت قصير. حاول بعد قليل."],
  [/TOO_MANY_WORKSPACES/, "لا يمكن إنشاء أكثر من 5 مساحات عمل."],
  [/BAD_EVENT_SCOPE/, "إحدى المناسبات المختارة لا تتبع هذه المساحة."],
  [/duplicate key.*phone|event_guests_event_id_phone/, "هذا الرقم مضاف مسبقًا في هذه المناسبة."],
  [/FORBIDDEN|permission denied|row-level security|42501/, "لا تملك صلاحية لهذا الإجراء."],
  [/check constraint/, "بعض البيانات غير صحيحة. راجع الحقول وحاول مرة أخرى."],
  [/fetch failed|NetworkError|Failed to fetch/i, "تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى."],
];

export function friendlyError(err: unknown): string {
  const msg =
    typeof err === "string" ? err : err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
  for (const [re, text] of MAP) if (re.test(msg)) return text;
  if (process.env.NODE_ENV !== "production" && msg) console.error("[unmapped error]", msg);
  return "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
