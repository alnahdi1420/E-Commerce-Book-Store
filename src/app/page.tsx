import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/config/brand";
import { LinkButton } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) redirect("/events");
  }
  const steps = [
    { t: "أنشئ مناسبتك", d: "الاسم والتاريخ والوقت والموقع فقط." },
    { t: "أضف المدعوين", d: "يدويًا أو بلصق قائمة أو من ملف جهات الاتصال." },
    { t: "أرسل من واتسابك", d: "رسالة جاهزة باسم كل مدعو ورابطه الخاص، وأنت من يضغط إرسال." },
    { t: "تابع الردود", d: "«سأحضر» أو «أعتذر» تصلك مباشرة في لوحة واحدة." },
  ];
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 py-10">
      <div className="flex items-center gap-2 text-lg font-bold text-brand">
        <span aria-hidden>{brand.logoEmoji}</span> {brand.name}
      </div>
      <h1 className="mt-10 text-3xl font-bold leading-snug sm:text-4xl">{brand.tagline}</h1>
      <p className="mt-3 text-ink-2">بدون تطبيق للتثبيت، وبدون ربط حساب واتساب. افتح الموقع من جوالك وابدأ.</p>
      <div className="mt-8 flex gap-3">
        <LinkButton href="/login" size="lg">
          ابدأ مجانًا
        </LinkButton>
        <LinkButton href="/login" variant="secondary" size="lg">
          تسجيل الدخول
        </LinkButton>
      </div>
      <ol className="mt-12 space-y-4">
        {steps.map((s, i) => (
          <li key={s.t} className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft font-bold text-brand">{i + 1}</span>
            <div>
              <p className="font-semibold">{s.t}</p>
              <p className="text-sm text-ink-2">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <footer className="mt-auto flex gap-4 pt-12 text-sm text-ink-2">
        <Link href="/privacy">الخصوصية</Link>
        <Link href="/terms">شروط الاستخدام</Link>
      </footer>
    </main>
  );
}
