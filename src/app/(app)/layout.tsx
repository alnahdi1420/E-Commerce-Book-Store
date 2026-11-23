import Link from "next/link";
import { brand } from "@/config/brand";
import { getCurrentWorkspace, getMemberships, isPlatformAdmin, requireUser } from "@/lib/session";
import { signOut } from "@/app/login/actions";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { NavLinks } from "@/components/nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const [ws, memberships, admin] = await Promise.all([getCurrentWorkspace(), getMemberships(), isPlatformAdmin()]);
  const links = [
    { href: "/events", label: "مناسباتي" },
    ...(ws.role !== "viewer" ? [{ href: "/contacts", label: "دفتر العناوين" }] : []),
    { href: "/team", label: "الفريق" },
    { href: "/settings", label: "الإعدادات" },
    ...(admin ? [{ href: "/admin", label: "إدارة المنصة" }] : []),
  ];
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link href="/events" className="flex items-center gap-1.5 font-bold text-brand">
            <span aria-hidden>{brand.logoEmoji}</span>
            <span>{brand.name}</span>
          </Link>
          <WorkspaceSwitcher
            current={ws.workspace_id}
            options={memberships.map((m) => ({ id: m.workspace_id, name: m.name, role: m.role }))}
          />
          <form action={signOut} className="ms-auto">
            <button className="rounded-lg px-2 py-1 text-sm text-ink-2 hover:bg-surface-2">خروج</button>
          </form>
        </div>
        <NavLinks links={links} />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">{children}</main>
    </div>
  );
}
