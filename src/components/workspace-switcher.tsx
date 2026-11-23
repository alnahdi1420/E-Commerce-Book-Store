"use client";

import { useTransition } from "react";
import { switchWorkspace } from "@/app/(app)/workspace-actions";

const ROLE: Record<string, string> = { owner: "مالك", organizer: "منظّم", viewer: "مشاهد" };

export function WorkspaceSwitcher({ current, options }: { current: string; options: { id: string; name: string; role: string }[] }) {
  const [pending, start] = useTransition();
  if (options.length < 2) {
    const o = options[0];
    return o ? <span className="truncate text-sm text-ink-2">{o.name}</span> : null;
  }
  return (
    <select
      aria-label="مساحة العمل"
      className="max-w-44 truncate rounded-lg border border-line bg-surface px-2 py-1 text-sm"
      value={current}
      disabled={pending}
      onChange={(e) => start(() => switchWorkspace(e.target.value))}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name} · {ROLE[o.role]}
        </option>
      ))}
    </select>
  );
}
