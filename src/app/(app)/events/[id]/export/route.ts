import { NextResponse, type NextRequest } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { createClient } from "@/lib/supabase/server";
import { loadGuests } from "@/lib/guests";
import { toCsv, safeCell } from "@/lib/csv";
import { phoneDigits } from "@/lib/phone";
import { RSVP_LABEL, SEND_LABEL, responseRate, type Stats } from "@/lib/status";
import { formatDateTime } from "@/lib/dates";

export async function GET(request: NextRequest, ctx: RouteContext<"/events/[id]/export">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", request.url));

  // RLS decides visibility; phones only for editors.
  const { data: event } = await supabase.from("events").select("id, title, timezone").eq("id", id).maybeSingle();
  if (!event) return new NextResponse("Not found", { status: 404 });
  const { data: canEdit } = await supabase.rpc("can_edit_event", { p_event: id });
  const [guests, { data: statsRow }] = await Promise.all([
    loadGuests(supabase, id, canEdit === true),
    supabase.from("event_stats").select("*").eq("event_id", id).maybeSingle(),
  ]);
  const s = statsRow as Stats | null;

  const header = ["الاسم", ...(canEdit ? ["الجوال"] : []), "حالة الإرسال", "الرد", "المرافقون", "مصدر الرد", "وقت الرد"];
  const rows = guests.map((g) => [
    g.name,
    ...(canEdit ? [g.phone ? phoneDigits(g.phone) : ""] : []),
    SEND_LABEL[g.send_status].label,
    RSVP_LABEL[g.rsvp_status].label,
    g.rsvp_status === "attending" ? g.companions : 0,
    g.response_source === "guest" ? "المدعو" : g.response_source === "organizer" ? "المنظّم (يدوي)" : "",
    g.responded_at ? formatDateTime(g.responded_at, event.timezone) : "",
  ]);
  const fileBase = `rsvp-${id.slice(0, 8)}`;

  if (format === "csv") {
    return new NextResponse(toCsv([header, ...rows]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const asCells = (r: (string | number)[]) => r.map((v) => (typeof v === "number" ? { value: v } : { value: safeCell(v), type: String }));
  const summary = [
    [{ value: "المناسبة", fontWeight: "bold" as const }, { value: safeCell(event.title) }],
    [{ value: "إجمالي المدعوين" }, { value: s?.total ?? 0 }],
    [{ value: "سيحضر" }, { value: s?.attending ?? 0 }],
    [{ value: "اعتذر" }, { value: s?.declined ?? 0 }],
    [{ value: "بانتظار الرد" }, { value: s?.pending ?? 0 }],
    [{ value: "نسبة الاستجابة ٪" }, { value: s ? responseRate(s) : 0 }],
    [{ value: "العدد المتوقع للحضور (مع المرافقين)" }, { value: s?.expected_people ?? 0 }],
  ];
  const buffer = await writeXlsxFile([
    { data: [header.map((h) => ({ value: h, fontWeight: "bold" as const })), ...rows.map(asCells)], sheet: "الردود", rightToLeft: true },
    { data: summary, sheet: "ملخص", rightToLeft: true },
  ] as never).toBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
