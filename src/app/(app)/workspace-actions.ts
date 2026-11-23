"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMemberships, WS_COOKIE } from "@/lib/session";

export async function switchWorkspace(workspaceId: string) {
  const memberships = await getMemberships();
  // Only allow switching to a workspace the user actually belongs to.
  if (!memberships.some((m) => m.workspace_id === workspaceId)) return;
  const jar = await cookies();
  jar.set(WS_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/events");
}
