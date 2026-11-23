import { NextResponse } from "next/server";
import { getInvitation } from "@/lib/invitation";
import { buildIcs } from "@/lib/ics";
import { createHash } from "node:crypto";

export async function GET(_req: Request, ctx: RouteContext<"/i/[token]/ics">) {
  const { token } = await ctx.params;
  const inv = await getInvitation(token);
  if (!inv) return new NextResponse("Not found", { status: 404 });
  const e = inv.event;
  const ics = buildIcs({
    uid: `${createHash("sha256").update(token).digest("hex").slice(0, 24)}@daawati`,
    title: e.title,
    startsAt: e.starts_at,
    location: [e.location_name, e.location_address].filter(Boolean).join(" - ") || e.location_url || undefined,
    url: e.location_url ?? undefined,
    description: e.description ?? undefined,
  });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="invitation.ics"',
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
