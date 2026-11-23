import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { isSupabaseConfigured } from "@/lib/env";
import { Alert } from "@/components/ui";
import { LoginForm } from "./login-form";
import { connection } from "next/server";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage(props: PageProps<"/login">) {
  await connection();
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const err = typeof sp.error === "string" ? sp.error : undefined;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-bold text-brand">
        <span aria-hidden>{brand.logoEmoji}</span> {brand.name}
      </Link>
      <h1 className="text-2xl font-bold">الدخول أو إنشاء حساب</h1>
      <p className="mt-1 text-sm text-ink-2">نرسل لك رمزًا إلى بريدك. لا حاجة لكلمة مرور.</p>
      <div className="mt-6 space-y-4">
        {!isSupabaseConfigured() ? (
          <Alert tone="warn">لم تُضبط إعدادات الخادم بعد (Supabase). راجع ملف README لإكمال الإعداد.</Alert>
        ) : null}
        {err === "link" ? <Alert tone="error">رابط الدخول غير صالح أو انتهت صلاحيته. اطلب رمزًا جديدًا.</Alert> : null}
        <LoginForm next={next} />
      </div>
      <p className="mt-10 text-xs text-ink-2">
        بالمتابعة فإنك توافق على <Link className="underline" href="/terms">شروط الاستخدام</Link> و
        <Link className="underline" href="/privacy">سياسة الخصوصية</Link>.
      </p>
    </main>
  );
}
