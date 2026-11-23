import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "whatsapp";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink hover:brightness-110 shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2",
  danger: "bg-surface text-no border border-no/30 hover:bg-no-soft",
  whatsapp: "bg-wa text-white hover:brightness-105 shadow-sm",
};
const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4", lg: "h-13 px-6 text-lg" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof sizes = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:pointer-events-none select-none",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-2xl border border-line bg-surface p-4 sm:p-5", className)} {...props} />;
}

export const inputClass =
  "w-full h-11 rounded-xl border border-line bg-surface px-3 text-ink placeholder:text-ink-2/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputClass, "h-auto min-h-24 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(inputClass, "appearance-auto", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-no" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-2">{hint}</p>
      ) : null}
    </div>
  );
}

const badgeTones = {
  ok: "bg-ok-soft text-ok",
  no: "bg-no-soft text-no",
  wait: "bg-wait-soft text-wait",
  info: "bg-info-soft text-[#2b4c8c]",
  muted: "bg-surface-2 text-ink-2",
  brand: "bg-brand-soft text-brand",
};
export function Badge({ tone = "muted", children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children ? <div className="mt-1 text-sm text-ink-2">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "error" | "ok" | "warn"; children: ReactNode }) {
  const t = {
    info: "bg-info-soft text-[#2b4c8c] border-[#c9d6f0]",
    error: "bg-no-soft text-no border-no/20",
    ok: "bg-ok-soft text-ok border-ok/20",
    warn: "bg-wait-soft text-wait border-wait/20",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl border px-3 py-2.5 text-sm leading-relaxed", t)}>
      {children}
    </div>
  );
}

export function Stepper({ step, eventId }: { step: 1 | 2 | 3; eventId?: string }) {
  const items = [
    { n: 1, label: "التفاصيل", href: eventId ? `/events/${eventId}/edit` : undefined },
    { n: 2, label: "المدعوون", href: eventId ? `/events/${eventId}/guests` : undefined },
    { n: 3, label: "إرسال", href: eventId ? `/events/${eventId}/send` : undefined },
  ];
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="خطوات المناسبة">
      {items.map((it, i) => {
        const active = it.n === step;
        const done = it.n < step;
        const content = (
          <span
            className={cx(
              "flex items-center gap-1.5 rounded-full px-3 py-1",
              active ? "bg-brand text-brand-ink" : done ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-2",
            )}
          >
            <span className="font-bold">{done ? "✓" : it.n}</span>
            {it.label}
          </span>
        );
        return (
          <li key={it.n} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
            {it.href && !active ? <Link href={it.href}>{content}</Link> : content}
            {i < items.length - 1 ? <span className="text-line">—</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        {subtitle ? <div className="mt-1 text-sm text-ink-2">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
