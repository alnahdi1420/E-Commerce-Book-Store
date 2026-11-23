"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { sendCode, verifyCode } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await sendCode(email, next);
      if (r.ok) setStage("code");
      else setError(r.error);
    });
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await verifyCode(email, code, next);
      if (r && !r.ok) setError(r.error);
    });
  }

  if (stage === "code") {
    return (
      <form onSubmit={submitCode} className="space-y-4">
        <Alert tone="ok">
          أرسلنا رسالة إلى <b className="ltr">{email}</b>. اكتب الرمز الموجود فيها، أو اضغط رابط الدخول في الرسالة.
        </Alert>
        <Field label="رمز الدخول" htmlFor="code">
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            className="text-center text-xl tracking-[0.4em]"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            required
          />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? "جارٍ التحقق…" : "دخول"}
        </Button>
        <button type="button" className="w-full text-sm text-ink-2 underline" onClick={() => setStage("email")}>
          تغيير البريد أو إعادة الإرسال
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitEmail} className="space-y-4">
      <Field label="البريد الإلكتروني" htmlFor="email">
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </Field>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "جارٍ الإرسال…" : "أرسل لي رمز الدخول"}
      </Button>
    </form>
  );
}
