"use client";

import { useState, useTransition } from "react";
import { acceptInvitation } from "@/app/(app)/team/actions";
import { Alert, Button } from "./ui";

export function AcceptButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await acceptInvitation(token);
            if (r && !r.ok) setError(r.error);
          })
        }
      >
        {pending ? "…" : "قبول الدعوة"}
      </Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
