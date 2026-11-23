import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Personal data export (JSON): profile, memberships, and everything in workspaces the user owns. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", request.url));
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) return new NextResponse("Error", { status: 500 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="my-data.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
