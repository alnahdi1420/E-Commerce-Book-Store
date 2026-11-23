"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { eventFormSchema, KIND_LABELS, type EventFormInput, type EventFormValues } from "@/lib/validation";
import { validateMapUrl } from "@/lib/maps";
import { Alert, Button, Field, Input, Select, Textarea, buttonClass } from "./ui";
import { createEvent, updateEvent } from "@/app/(app)/events/actions";

export function EventForm({ eventId, defaults }: { eventId?: string; defaults: Partial<EventFormInput> }) {
  const [pending, start] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const hasExtras = Boolean(
    defaults.description || defaults.deadline_date || Number(defaults.max_companions) > 0 || defaults.capacity || defaults.kind !== "other",
  );
  const [extras, setExtras] = useState(hasExtras);

  const form = useForm<EventFormInput, unknown, EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      timezone: "Asia/Riyadh",
      kind: "other",
      max_companions: 0,
      allow_change: true,
      show_capacity: false,
      ...defaults,
    },
  });
  const { register, handleSubmit, control, formState } = form;
  const errors = formState.errors;
  const mapUrl = useWatch({ control, name: "location_url" });
  const mapCheck = mapUrl ? validateMapUrl(String(mapUrl)) : null;

  const onSubmit = handleSubmit((_values, e) => {
    setServerError(null);
    setSaved(null);
    // Send the raw input; the server re-validates with the same schema.
    const raw = form.getValues();
    void e;
    start(async () => {
      const r = eventId ? await updateEvent(eventId, raw) : await createEvent(raw);
      if (r && !r.ok) setServerError(r.error);
      else if (r?.ok && r.message) setSaved(r.message);
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="اسم المناسبة" htmlFor="title" error={errors.title?.message}>
        <Input id="title" placeholder="مثال: حفل عشاء" {...register("title")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="التاريخ" htmlFor="date" error={errors.date?.message}>
          <Input id="date" type="date" {...register("date")} />
        </Field>
        <Field label="الوقت" htmlFor="time" error={errors.time?.message}>
          <Input id="time" type="time" {...register("time")} />
        </Field>
      </div>
      <Field
        label="رابط الموقع"
        htmlFor="location_url"
        error={errors.location_url?.message}
        hint={
          mapCheck?.ok ? (
            <span className="flex flex-wrap items-center gap-2">
              {mapCheck.isKnownMap ? "✓ رابط خرائط صالح" : "رابط صالح (ليس من خرائط معروفة)"}
              <a href={mapCheck.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">
                عرض الموقع
              </a>
            </span>
          ) : (
            "انسخ رابط المكان من خرائط Google وألصقه هنا"
          )
        }
      >
        <Input id="location_url" dir="ltr" inputMode="url" placeholder="https://maps.app.goo.gl/…" {...register("location_url")} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم المكان" htmlFor="location_name" error={errors.location_name?.message}>
          <Input id="location_name" placeholder="مثال: قاعة الريم" {...register("location_name")} />
        </Field>
        <Field label="العنوان (اختياري)" htmlFor="location_address" error={errors.location_address?.message}>
          <Input id="location_address" placeholder="الحي، المدينة" {...register("location_address")} />
        </Field>
      </div>
      <Field label="اسم صاحب الدعوة" htmlFor="host_name" error={errors.host_name?.message} hint="يظهر في الرسالة وصفحة الدعوة">
        <Input id="host_name" {...register("host_name")} />
      </Field>

      <div className="rounded-2xl border border-line bg-surface">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 font-semibold"
          aria-expanded={extras}
          onClick={() => setExtras((v) => !v)}
        >
          خيارات إضافية <span className="text-ink-2">{extras ? "−" : "+"}</span>
        </button>
        {extras ? (
          <div className="space-y-4 border-t border-line p-4">
            <Field label="نوع المناسبة" htmlFor="kind">
              <Select id="kind" {...register("kind")}>
                {Object.entries(KIND_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="وصف قصير" htmlFor="description" error={errors.description?.message}>
              <Textarea id="description" rows={3} {...register("description")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="آخر موعد للرد" htmlFor="deadline_date">
                <Input id="deadline_date" type="date" {...register("deadline_date")} />
              </Field>
              <Field label="الساعة" htmlFor="deadline_time">
                <Input id="deadline_time" type="time" {...register("deadline_time")} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="المرافقون المسموح بهم لكل مدعو" htmlFor="max_companions" error={errors.max_companions?.message}>
                <Input id="max_companions" type="number" min={0} max={20} inputMode="numeric" {...register("max_companions")} />
              </Field>
              <Field label="عدد المقاعد (اختياري)" htmlFor="capacity" error={errors.capacity?.message}>
                <Input id="capacity" type="number" min={1} inputMode="numeric" {...register("capacity")} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--brand)]" {...register("show_capacity")} />
              إظهار عدد المقاعد المتبقية للمدعوين
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--brand)]" {...register("allow_change")} />
              السماح للمدعو بتعديل رده لاحقًا
            </label>
          </div>
        ) : null}
      </div>

      {serverError ? <Alert tone="error">{serverError}</Alert> : null}
      {saved ? <Alert tone="ok">{saved}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={pending} className="min-w-40">
          {pending ? "جارٍ الحفظ…" : eventId ? "حفظ" : "التالي: المدعوون ←"}
        </Button>
        {eventId ? (
          <a className={buttonClass("secondary", "lg")} href={`/events/${eventId}/guests`}>
            المدعوون
          </a>
        ) : null}
      </div>
    </form>
  );
}
