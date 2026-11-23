import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Records that the organizer pressed "Open WhatsApp" for a guest.
 * Called with fetch(..., { keepalive: true }) right before navigating to wa.me,
 * so it survives the page being backgrounded. It does NOT mean the message was sent.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/guests/[id]/opened">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  // Same-origin only (CSRF defense for a cookie-authenticated endpoint).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_guest_opened", { p_guest: id });
  if (error) return NextResponse.json({ ok: false }, { status: 403 });
  return NextResponse.json({ ok: true });
}
