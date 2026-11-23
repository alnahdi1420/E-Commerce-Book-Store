"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2 text-sm" aria-label="القائمة">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "whitespace-nowrap rounded-full px-3 py-1.5 font-medium",
              active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
