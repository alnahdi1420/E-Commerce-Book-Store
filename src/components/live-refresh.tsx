"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Refreshes server data when a guest row of this event changes (Supabase Realtime,
 * filtered by RLS), with a light polling fallback while the tab is visible.
 */
export function LiveRefresh({ eventId }: { eventId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`event-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_guests", filter: `event_id=eq.${eventId}` }, refresh)
      .subscribe();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [eventId, router]);

  return null;
}
