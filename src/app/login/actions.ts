"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { emailSchema } from "@/lib/validation";
import { siteUrl } from "@/lib/session";
import type { ActionResult } from "@/lib/errors";
import { safeNext } from "@/lib/safe-next";


export async function sendCode(email: string, next?: string): Promise<ActionResult> {
  const e = emailSchema.safeParse(email);
  if (!e.success) return { ok: false, error: "اكتب بريدًا إلكترونيًا صحيحًا" };
  const h = await headers();
  const base = siteUrl(h.get("host"), h.get("x-forwarded-proto"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: e.data,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${base}/auth/callback?next=${encodeURIComponent(safeNext(next))}`,
    },
  });
  if (error) {
    if (/rate|seconds/i.test(error.message)) return { ok: false, error: "طلبت رمزًا قبل قليل. انتظر دقيقة ثم حاول مرة أخرى." };
    return { ok: false, error: "تعذّر إرسال الرمز. تأكد من البريد وحاول مرة أخرى." };
  }
  return { ok: true };
}

export async function verifyCode(email: string, code: string, next?: string): Promise<ActionResult> {
  const e = emailSchema.safeParse(email);
  const token = code.replace(/\D/g, "");
  if (!e.success || token.length < 6 || token.length > 10) return { ok: false, error: "اكتب الرمز كما وصلك" };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: e.data, token, type: "email" });
  if (error) return { ok: false, error: "الرمز غير صحيح أو انتهت صلاحيته." };
  redirect(safeNext(next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
