"use server";

import { headers } from "next/headers";
import { clientKey } from "@/lib/tokens";
import { isTokenShape, publicClient } from "@/lib/invitation";

export type RsvpResult = { ok: true; rsvp_status: string; companions: number } | { ok: false; error: string };

const MESSAGES: Record<string, string> = {
  not_found: "رابط الدعوة غير صالح.",
  closed: "انتهى استقبال الردود لهذه المناسبة.",
  deadline: "انتهى آخر موعد للرد.",
  ended: "انتهت المناسبة.",
  locked: "سُجّل ردك مسبقًا، ولا يمكن تعديله لهذه المناسبة. تواصل مع صاحب الدعوة إن احتجت للتغيير.",
  full: "عذرًا، اكتمل العدد المتاح.",
  rate_limited: "محاولات كثيرة. حاول بعد قليل.",
};

export async function submitRsvp(token: string, status: "attending" | "declined", companions: number): Promise<RsvpResult> {
  if (!isTokenShape(token) || (status !== "attending" && status !== "declined")) {
    return { ok: false, error: MESSAGES.not_found };
  }
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  const { data, error } = await publicClient().rpc("submit_rsvp", {
    p_token: token,
    p_status: status,
    p_companions: Math.max(0, Math.min(20, Math.floor(companions) || 0)),
    p_client_key: clientKey(ip),
  });
  if (error) return { ok: false, error: "تعذّر حفظ ردك. حاول مرة أخرى." };
  const r = data as { ok: boolean; error?: string; rsvp_status?: string; companions?: number };
  if (!r.ok) return { ok: false, error: MESSAGES[r.error ?? ""] ?? "تعذّر حفظ ردك." };
  return { ok: true, rsvp_status: r.rsvp_status!, companions: r.companions ?? 0 };
}
