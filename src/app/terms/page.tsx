import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "شروط الاستخدام" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-5 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-brand">
        ← {brand.name}
      </Link>
      <h1 className="text-2xl font-bold">شروط الاستخدام</h1>
      <ol className="list-decimal space-y-2 ps-5">
        <li>الخدمة أداة لتنظيم دعوات المناسبات ومتابعة الردود. تُرسل الدعوات من حساب واتساب الخاص بك وبضغطك أنت.</li>
        <li>يُمنع استخدام الخدمة لإرسال رسائل مزعجة أو تسويقية جماعية أو لأشخاص لا تربطك بهم علاقة، ويجب الالتزام بسياسات واتساب.</li>
        <li>أنت مسؤول عن صحة البيانات التي تضيفها وعن حصولك على أرقام المدعوين بطريقة مشروعة.</li>
        <li>حالة «أُرسلت» تعكس تأكيدك أنت فقط، ولا تعني وصول الرسالة أو قراءتها.</li>
        <li>قد تتغير الخطط وحدودها؛ وسنوضح أي رسوم قبل تطبيقها. لا يوجد تحصيل مالي حاليًا.</li>
        <li>يحق لنا إيقاف أي حساب يسيء استخدام الخدمة.</li>
      </ol>
    </main>
  );
}
