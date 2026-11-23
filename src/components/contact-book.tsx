"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addContact, deleteContacts } from "@/app/(app)/contacts/actions";
import { formatPhone } from "@/lib/phone";
import { Alert, Button, Card, EmptyState, Input } from "./ui";

export function ContactBook({ contacts }: { contacts: { id: string; name: string; phone_e164: string }[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const digits = q.replace(/\D/g, "");
  const list = contacts.filter((c) => !q || c.name.includes(q) || (!!digits && c.phone_e164.includes(digits)));

  return (
    <div className="space-y-4">
      <Card>
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await addContact(name, phone);
              if (!r.ok) return setError(r.error);
              setName("");
              setPhone("");
              router.refresh();
            });
          }}
        >
          <Input placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} aria-label="الاسم" />
          <Input placeholder="رقم الجوال" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="رقم الجوال" />
          <Button type="submit" disabled={pending}>
            حفظ
          </Button>
        </form>
        {error ? <div className="mt-2"><Alert tone="error">{error}</Alert></div> : null}
      </Card>
      {contacts.length === 0 ? (
        <EmptyState title="الدفتر فارغ">يمكنك أيضًا الحفظ في الدفتر أثناء استيراد المدعوين.</EmptyState>
      ) : (
        <>
          <Input type="search" placeholder="بحث" value={q} onChange={(e) => setQ(e.target.value)} />
          {sel.size ? (
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() =>
                confirm(`حذف ${sel.size} من الدفتر؟ لن يُحذفوا من المناسبات.`) &&
                start(async () => {
                  const r = await deleteContacts([...sel]);
                  if (!r.ok) setError(r.error);
                  setSel(new Set());
                  router.refresh();
                })
              }
            >
              حذف {sel.size} من الدفتر
            </Button>
          ) : null}
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.slice(0, 500).map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={sel.has(c.id)}
                    onChange={(e) => {
                      const n = new Set(sel);
                      if (e.target.checked) n.add(c.id);
                      else n.delete(c.id);
                      setSel(n);
                    }}
                  />
                  <span className="flex-1">{c.name}</span>
                  <span className="ltr text-sm text-ink-2">{formatPhone(c.phone_e164)}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
