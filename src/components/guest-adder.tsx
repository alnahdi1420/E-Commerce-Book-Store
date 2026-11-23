"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { addGuests, type AddGuestsResult } from "@/app/(app)/events/[id]/guests/actions";
import { buildPreview, guessColumns, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parsePastedText, parseVcf, tableToRows, type PreviewRow, type RawRow } from "@/lib/import";
import { normalizePhone, formatPhone } from "@/lib/phone";
import { Alert, Badge, Button, Field, Input, Select, Textarea, cx } from "./ui";

type Tab = "one" | "paste" | "file" | "phone" | "book";
type Contact = { id: string; name: string; phone_e164: string };

type ContactsManager = { select: (props: string[], opts: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };

export function GuestAdder({ eventId, existingPhones, contacts }: { eventId: string; existingPhones: string[]; contacts: Contact[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("one");
  const [pickerSupported, setPickerSupported] = useState(false);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [result, setResult] = useState<AddGuestsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveToBook, setSaveToBook] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    // Contact Picker API: Android Chrome. Not available in iPhone Safari by default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPickerSupported(typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window);
  }, []);

  const existing = useMemo(() => new Set(existingPhones), [existingPhones]);

  function preview(raw: RawRow[]) {
    setError(null);
    setResult(null);
    if (!raw.length) return setError("لم نجد أسماء أو أرقام.");
    if (raw.length > MAX_IMPORT_ROWS) setError(`سنعرض أول ${MAX_IMPORT_ROWS} سجل فقط.`);
    setRows(buildPreview(raw, existing));
  }

  function submit(list: { name: string; phone: string; contact_id?: string | null }[], onDone?: () => void) {
    setError(null);
    start(async () => {
      const r = await addGuests(eventId, list, saveToBook);
      if (!r.ok) return setError(r.error);
      setResult(r.data ?? null);
      setRows(null);
      onDone?.();
      router.refresh();
    });
  }

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "one", label: "إضافة مدعو", show: true },
    { id: "paste", label: "لصق قائمة", show: true },
    { id: "file", label: "من ملف", show: true },
    { id: "phone", label: "من جهات الهاتف", show: pickerSupported },
    { id: "book", label: "دفتر العناوين", show: contacts.length > 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1" role="tablist">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setRows(null);
                setError(null);
              }}
              className={cx("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold", tab === t.id ? "bg-surface shadow-sm" : "text-ink-2")}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === "one" ? <SingleForm pending={pending} onAdd={(r, done) => submit([r], done)} /> : null}
      {tab === "paste" && !rows ? <PasteForm onPreview={(t) => preview(parsePastedText(t))} /> : null}
      {tab === "file" && !rows ? <FileForm onPreview={preview} onError={setError} /> : null}
      {tab === "phone" && !rows ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-2">اختر جهات محددة فقط. لا نطّلع على بقية جهات الاتصال.</p>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                const picked = await (navigator as unknown as { contacts: ContactsManager }).contacts.select(["name", "tel"], { multiple: true });
                preview(picked.flatMap((c) => (c.tel ?? []).map((tel) => ({ name: c.name?.[0] ?? "", phone: tel }))));
              } catch {
                setError("لم يُختر أي جهة اتصال.");
              }
            }}
          >
            اختيار من جهات الاتصال
          </Button>
        </div>
      ) : null}
      {tab === "book" && !rows ? <BookPicker contacts={contacts} existing={existing} pending={pending} onAdd={(list) => submit(list)} /> : null}

      {!pickerSupported && (tab === "one" || tab === "file") ? (
        <p className="text-xs text-ink-2">
          تريد إضافة جهات من جوالك؟ في iPhone: افتح جهات الاتصال ← اختر الجهة ← «مشاركة جهة الاتصال» واحفظها كملف، ثم ارفعه من «من ملف». أو انسخ الأرقام في «لصق قائمة».
        </p>
      ) : null}

      {rows ? (
        <ImportPreview
          rows={rows}
          setRows={setRows}
          pending={pending}
          saveToBook={saveToBook}
          setSaveToBook={setSaveToBook}
          onCancel={() => setRows(null)}
          onConfirm={() => submit(rows.filter((r) => r.include && r.e164).map((r) => ({ name: r.name, phone: r.e164! })))}
        />
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {result ? (
        <Alert tone={result.inserted ? "ok" : "warn"}>
          أُضيف {result.inserted} مدعو.
          {result.skipped.length ? ` تُجوهل ${result.skipped.filter((s) => s.reason === "duplicate").length} مكرر.` : ""}
          {result.skipped.some((s) => s.reason === "plan_limit") ? " بعض الأسماء لم تُضف لأنك وصلت إلى حد خطتك." : ""}
          {result.invalid ? ` ${result.invalid} رقم غير صحيح.` : ""}
        </Alert>
      ) : null}
    </div>
  );
}

function SingleForm({ pending, onAdd }: { pending: boolean; onAdd: (r: { name: string; phone: string }, done: () => void) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const check = phone ? normalizePhone(phone) : null;
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setErr("اكتب الاسم");
        if (!check?.ok) return setErr(check ? check.error : "اكتب رقم الجوال");
        setErr(null);
        onAdd({ name: name.trim(), phone: check.e164 }, () => {
          setName("");
          setPhone("");
        });
      }}
    >
      <Field label="الاسم" htmlFor="g-name">
        <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </Field>
      <Field
        label="رقم الجوال"
        htmlFor="g-phone"
        hint={check?.ok ? <span className="ltr">{formatPhone(check.e164)}</span> : "مثال: 0501234567 أو +971…"}
        error={err ?? undefined}
      >
        <Input id="g-phone" dir="ltr" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending} className="sm:mb-6">
        {pending ? "…" : "إضافة"}
      </Button>
    </form>
  );
}

function PasteForm({ onPreview }: { onPreview: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-3">
      <Field label="الأسماء والأرقام" htmlFor="paste" hint="سطر لكل مدعو: الاسم ثم الرقم، بأي ترتيب أو فاصل.">
        <Textarea id="paste" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={"أحمد 0501234567\nسارة 0502345678"} />
      </Field>
      <Button variant="secondary" disabled={!text.trim()} onClick={() => onPreview(text)}>
        معاينة
      </Button>
    </div>
  );
}

function FileForm({ onPreview, onError }: { onPreview: (rows: RawRow[]) => void; onError: (e: string) => void }) {
  const [table, setTable] = useState<string[][] | null>(null);
  const [cfg, setCfg] = useState<{ header: boolean; name: number; phone: number } | null>(null);

  async function onFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return onError("حجم الملف أكبر من 2 ميجابايت.");
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".vcf") || file.type.includes("vcard")) {
        onPreview(parseVcf(await file.text()));
        return;
      }
      let t: string[][];
      if (name.endsWith(".xlsx")) {
        const { readSheet } = await import("read-excel-file/browser");
        const data = await readSheet(file);
        t = data.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))));
      } else if (name.endsWith(".csv") || name.endsWith(".txt") || file.type.includes("csv")) {
        const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: true });
        t = parsed.data.map((r) => r.map((c) => String(c ?? "")));
      } else {
        return onError("الصيغ المدعومة: CSV أو Excel (xlsx) أو جهات اتصال (vcf).");
      }
      t = t.slice(0, MAX_IMPORT_ROWS + 1);
      setTable(t);
      setCfg(guessColumns(t));
    } catch {
      onError("تعذّرت قراءة الملف. تأكد من صيغته.");
    }
  }

  if (table && cfg) {
    const cols = Math.max(...table.slice(0, 20).map((r) => r.length));
    const colName = (i: number) => (cfg.header ? table[0][i] || `عمود ${i + 1}` : `عمود ${i + 1}`);
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="عمود الاسم" htmlFor="col-name">
            <Select id="col-name" value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: Number(e.target.value) })}>
              {Array.from({ length: cols }, (_, i) => (
                <option key={i} value={i}>
                  {colName(i)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="عمود الرقم" htmlFor="col-phone">
            <Select id="col-phone" value={cfg.phone} onChange={(e) => setCfg({ ...cfg, phone: Number(e.target.value) })}>
              {Array.from({ length: cols }, (_, i) => (
                <option key={i} value={i}>
                  {colName(i)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cfg.header} onChange={(e) => setCfg({ ...cfg, header: e.target.checked })} />
          الصف الأول عناوين أعمدة
        </label>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onPreview(tableToRows(table, cfg))}>
            معاينة
          </Button>
          <Button variant="ghost" onClick={() => setTable(null)}>
            ملف آخر
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-line bg-surface p-6 text-center hover:border-brand/40">
        <span className="font-semibold">اختر ملفًا</span>
        <span className="text-xs text-ink-2">CSV أو Excel (xlsx) أو ملف جهات اتصال vcf · حتى {MAX_IMPORT_ROWS} سجل</span>
        <input
          type="file"
          accept=".csv,.txt,.xlsx,.vcf,text/csv,text/vcard,text/x-vcard,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
    </div>
  );
}

function ImportPreview({
  rows,
  setRows,
  pending,
  saveToBook,
  setSaveToBook,
  onCancel,
  onConfirm,
}: {
  rows: PreviewRow[];
  setRows: (r: PreviewRow[]) => void;
  pending: boolean;
  saveToBook: boolean;
  setSaveToBook: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ok = rows.filter((r) => r.include).length;
  const dup = rows.filter((r) => r.duplicateInBatch || r.alreadyInEvent).length;
  const bad = rows.filter((r) => r.error).length;

  function edit(key: number, patch: Partial<Pick<PreviewRow, "name" | "rawPhone" | "include">>) {
    setRows(
      rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.name !== undefined || patch.rawPhone !== undefined) {
          const p = normalizePhone(next.rawPhone);
          next.e164 = p.ok ? p.e164 : null;
          next.error = p.ok ? (next.name.trim() ? null : "الاسم مفقود") : p.error;
          next.alreadyInEvent = false;
          next.duplicateInBatch = !!next.e164 && rows.some((o) => o.key !== key && o.include && o.e164 === next.e164);
          next.include = !next.error && !next.duplicateInBatch;
        }
        if (patch.include && (next.error || !next.e164)) next.include = false;
        return next;
      }),
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge tone="ok">جاهز {ok}</Badge>
        {dup ? <Badge tone="wait">مكرر {dup}</Badge> : null}
        {bad ? <Badge tone="no">يحتاج تصحيح {bad}</Badge> : null}
      </div>
      <div className="max-h-[50vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface text-ink-2">
            <tr>
              <th className="w-8 p-1"></th>
              <th className="p-1 text-start">الاسم</th>
              <th className="p-1 text-start">الرقم</th>
              <th className="p-1 text-start">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={cx("border-t border-line", !r.include && "opacity-70")}>
                <td className="p-1">
                  <input type="checkbox" aria-label="تضمين" checked={r.include} disabled={!!r.error} onChange={(e) => edit(r.key, { include: e.target.checked })} />
                </td>
                <td className="p-1">
                  <input className="w-full rounded-lg border border-transparent bg-transparent px-1 py-1 hover:border-line focus:border-brand" value={r.name} onChange={(e) => edit(r.key, { name: e.target.value })} />
                </td>
                <td className="p-1">
                  <input dir="ltr" className="w-full rounded-lg border border-transparent bg-transparent px-1 py-1 hover:border-line focus:border-brand" value={r.rawPhone} onChange={(e) => edit(r.key, { rawPhone: e.target.value })} />
                </td>
                <td className="p-1">
                  {r.error ? (
                    <Badge tone="no">{r.error}</Badge>
                  ) : r.alreadyInEvent ? (
                    <Badge tone="wait">مضاف مسبقًا</Badge>
                  ) : r.duplicateInBatch ? (
                    <Badge tone="wait">مكرر في القائمة</Badge>
                  ) : (
                    <span className="ltr text-xs text-ink-2">{r.e164}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saveToBook} onChange={(e) => setSaveToBook(e.target.checked)} />
        احفظهم أيضًا في دفتر العناوين لاستخدامهم في مناسبات قادمة
      </label>
      <div className="flex gap-2">
        <Button onClick={onConfirm} disabled={pending || ok === 0}>
          {pending ? "جارٍ الإضافة…" : `إضافة ${ok} مدعو`}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}

function BookPicker({
  contacts,
  existing,
  pending,
  onAdd,
}: {
  contacts: Contact[];
  existing: Set<string>;
  pending: boolean;
  onAdd: (list: { name: string; phone: string; contact_id: string }[]) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const list = contacts.filter((c) => !q || c.name.includes(q) || c.phone_e164.includes(q.replace(/\D/g, "")));
  return (
    <div className="space-y-3">
      <Input placeholder="بحث بالاسم أو الرقم" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="max-h-[45vh] divide-y divide-line overflow-auto rounded-xl border border-line bg-surface">
        {list.slice(0, 300).map((c) => {
          const already = existing.has(c.phone_e164);
          return (
            <li key={c.id}>
              <label className={cx("flex items-center gap-3 px-3 py-2", already && "opacity-50")}>
                <input
                  type="checkbox"
                  disabled={already}
                  checked={sel.has(c.id)}
                  onChange={(e) => {
                    const n = new Set(sel);
                    if (e.target.checked) n.add(c.id);
                    else n.delete(c.id);
                    setSel(n);
                  }}
                />
                <span className="flex-1">{c.name}</span>
                <span className="ltr text-xs text-ink-2">{already ? "مضاف" : formatPhone(c.phone_e164)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <Button
        disabled={pending || sel.size === 0}
        onClick={() => onAdd(contacts.filter((c) => sel.has(c.id)).map((c) => ({ name: c.name, phone: c.phone_e164, contact_id: c.id })))}
      >
        إضافة {sel.size} مدعو
      </Button>
    </div>
  );
}
