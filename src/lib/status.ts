export type EventStatus = "draft" | "published" | "archived" | "cancelled";

/** Display status. "Ended" is derived from time, not stored, so it can never be stale. */
export function eventStatusLabel(status: EventStatus, startsAt: string): { label: string; tone: "muted" | "brand" | "ok" | "no" | "wait" } {
  if (status === "cancelled") return { label: "ملغاة", tone: "no" };
  if (status === "archived") return { label: "مؤرشفة", tone: "muted" };
  if (new Date(startsAt).getTime() < Date.now() - 6 * 3600_000) return { label: "منتهية", tone: "muted" };
  if (status === "draft") return { label: "مسودة", tone: "wait" };
  return { label: "منشورة", tone: "ok" };
}

export const SEND_LABEL = {
  not_started: { label: "لم تُرسل", tone: "muted" },
  opened: { label: "فُتح واتساب", tone: "info" },
  sent: { label: "أُرسلت (تأكيدك)", tone: "brand" },
} as const;

export const RSVP_LABEL = {
  pending: { label: "بانتظار الرد", tone: "wait" },
  attending: { label: "سيحضر", tone: "ok" },
  declined: { label: "اعتذر", tone: "no" },
} as const;

export type Stats = {
  total: number;
  attending: number;
  declined: number;
  pending: number;
  not_sent: number;
  opened: number;
  sent: number;
  expected_people: number;
};

export function responseRate(s: Pick<Stats, "total" | "attending" | "declined">): number {
  return s.total ? Math.round(((s.attending + s.declined) / s.total) * 100) : 0;
}
