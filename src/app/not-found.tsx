import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="text-ink-2">قد يكون الرابط خاطئًا أو لا تملك صلاحية الوصول.</p>
      <Link href="/events" className="font-semibold text-brand underline">
        العودة إلى مناسباتي
      </Link>
    </main>
  );
}
