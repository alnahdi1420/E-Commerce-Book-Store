"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveCoverPath } from "@/app/(app)/events/actions";
import { Alert, Button } from "./ui";

const MAX = 3 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function CoverUpload({ eventId, workspaceId, currentUrl }: { eventId: string; workspaceId: string; currentUrl: string | null }) {
  const [url, setUrl] = useState(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    const ext = TYPES[file.type];
    if (!ext) return setError("الصيغ المقبولة: JPG أو PNG أو WEBP");
    if (file.size > MAX) return setError("حجم الصورة أكبر من 3 ميجابايت");
    start(async () => {
      const supabase = createClient();
      const path = `${workspaceId}/${eventId}/cover-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("event-covers").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) return setError("تعذّر رفع الصورة");
      const r = await saveCoverPath(eventId, path);
      if (!r.ok) return setError(r.error);
      setUrl(supabase.storage.from("event-covers").getPublicUrl(path).data.publicUrl);
    });
  }

  return (
    <div className="space-y-3">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="بطاقة الدعوة" className="max-h-64 w-full rounded-xl object-contain bg-surface-2" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex h-11 cursor-pointer items-center rounded-xl border border-line bg-surface px-4 font-semibold hover:bg-surface-2">
          {pending ? "جارٍ الرفع…" : url ? "تغيير الصورة" : "اختر صورة"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={pending} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {url ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveCoverPath(eventId, null);
                if (r.ok) setUrl(null);
                else setError(r.error);
              })
            }
          >
            إزالة
          </Button>
        ) : null}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
