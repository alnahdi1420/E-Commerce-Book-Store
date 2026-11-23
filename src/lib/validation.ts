import { z } from "zod";
import { validateMapUrl } from "./maps";
import { isValidTimeZone } from "./dates";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `الحد الأقصى ${max} حرفًا`)
    .optional()
    .transform((v) => (v ? v : null));

export const eventFormSchema = z
  .object({
    title: z.string().trim().min(1, "اكتب اسم المناسبة").max(120, "الاسم طويل جدًا"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "اختر التاريخ"),
    time: z.string().regex(/^\d{2}:\d{2}$/, "اختر الوقت"),
    timezone: z.string().default("Asia/Riyadh").refine(isValidTimeZone, "منطقة زمنية غير صحيحة"),
    location_url: z
      .string()
      .trim()
      .optional()
      .superRefine((v, ctx) => {
        if (v && !validateMapUrl(v).ok) ctx.addIssue({ code: "custom", message: "رابط الموقع غير صالح" });
      })
      .transform((v) => {
        if (!v) return null;
        const r = validateMapUrl(v);
        return r.ok ? r.url : null;
      }),
    location_name: optionalText(160),
    location_address: optionalText(300),
    host_name: z.string().trim().min(1, "اكتب اسم صاحب الدعوة").max(100),
    // extra options
    description: optionalText(2000),
    kind: z.enum(["wedding", "meeting", "dinner", "party", "other"]).default("other"),
    deadline_date: z.string().optional(),
    deadline_time: z.string().optional(),
    max_companions: z.coerce.number().int().min(0).max(20).default(0),
    capacity: z
      .union([z.literal(""), z.coerce.number().int().min(1).max(100000)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    show_capacity: z.coerce.boolean().default(false),
    allow_change: z.coerce.boolean().default(true),
  })
  .refine((v) => v.location_url || v.location_name || v.location_address, {
    message: "أضف رابط الموقع أو اسم المكان",
    path: ["location_url"],
  });

export type EventFormInput = z.input<typeof eventFormSchema>;
export type EventFormValues = z.output<typeof eventFormSchema>;

export const KIND_LABELS: Record<string, string> = {
  wedding: "زواج",
  meeting: "اجتماع",
  dinner: "عشاء",
  party: "حفل",
  other: "أخرى",
};

export const emailSchema = z.string().trim().toLowerCase().email("بريد إلكتروني غير صحيح").max(254);
