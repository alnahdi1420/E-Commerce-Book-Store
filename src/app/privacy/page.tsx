import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "سياسة الخصوصية" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-5 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-brand">
        ← {brand.name}
      </Link>
      <h1 className="text-2xl font-bold">سياسة الخصوصية</h1>
      <p>نجمع أقل قدر ممكن من البيانات لغرض واحد: مساعدتك على دعوة ضيوفك ومتابعة ردودهم.</p>
      <h2 className="text-lg font-bold">ما الذي نحفظه</h2>
      <ul className="list-disc space-y-1 ps-5">
        <li>بريدك الإلكتروني لتسجيل الدخول، واسمك إن أضفته.</li>
        <li>بيانات المناسبات التي تنشئها.</li>
        <li>أسماء المدعوين وأرقام جوالاتهم التي تضيفها أنت، وردودهم (سأحضر/أعتذر وعدد المرافقين) ووقت الرد.</li>
        <li>سجل بسيط لتعديلات الردود (من عدّل ومتى) لضمان الدقة.</li>
      </ul>
      <h2 className="text-lg font-bold">ما الذي لا نفعله</h2>
      <ul className="list-disc space-y-1 ps-5">
        <li>لا نصل إلى حساب واتساب الخاص بك ولا نقرأ محادثاتك. الرسائل تُرسل منك يدويًا.</li>
        <li>لا نستورد جهات اتصال هاتفك كاملة؛ فقط ما تختاره صراحة.</li>
        <li>لا نبيع البيانات ولا نشاركها مع معلنين.</li>
        <li>صفحة الدعوة لا تعرض أرقام المدعوين ولا قائمة الضيوف، ورابط كل مدعو خاص به ولا يمكن تخمينه.</li>
      </ul>
      <h2 className="text-lg font-bold">مسؤوليتك كمنظّم</h2>
      <p>أضف فقط أرقام أشخاص تعرفهم ولديك سبب مشروع لدعوتهم، واحذف البيانات حين لا تحتاجها.</p>
      <h2 className="text-lg font-bold">حقوقك</h2>
      <p>يمكنك من صفحة الإعدادات تنزيل نسخة من بياناتك، وحذف أي مدعو أو مناسبة أو مساحة عمل أو حسابك بالكامل.</p>
      <h2 className="text-lg font-bold">الاحتفاظ</h2>
      <p>تبقى البيانات ما دام حسابك قائمًا أو حتى تحذفها. ننصح بأرشفة أو حذف المناسبات المنتهية التي لم تعد تحتاجها.</p>
      {brand.supportEmail ? (
        <p>
          للتواصل: <span className="ltr">{brand.supportEmail}</span>
        </p>
      ) : null}
    </main>
  );
}
