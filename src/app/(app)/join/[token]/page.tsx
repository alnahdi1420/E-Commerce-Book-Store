import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { Alert, Card } from "@/components/ui";
import { AcceptButton } from "@/components/accept-button";

export const metadata: Metadata = { title: "الانضمام إلى فريق", robots: { index: false } };

const ROLE: Record<string, string> = { organizer: "منظّم", viewer: "مشاهد" };

export default async function JoinPage(props: PageProps<"/join/[token]">) {
  const { token } = await props.params;
  const { supabase, user } = await requireUser();
  const valid = /^[A-Za-z0-9_-]{32,128}$/.test(token);
  const { data } = valid ? await supabase.rpc("preview_workspace_invitation", { p_token: token }) : { data: null };
  const p = data as { state: string; workspace_name: string; role: string; email_matches: boolean } | null;

  return (
    <div className="mx-auto max-w-md">
      <Card className="space-y-4 text-center">
        <h1 className="text-xl font-bold">دعوة للانضمام</h1>
        {!p || p.state === "invalid" ? (
          <Alert tone="error">رابط الدعوة غير صالح.</Alert>
        ) : p.state !== "valid" ? (
          <Alert tone="error">
            {p.state === "expired" ? "انتهت صلاحية هذه الدعوة." : p.state === "used" ? "استُخدمت هذه الدعوة من قبل." : "أُلغيت هذه الدعوة."} اطلب من
            المالك دعوة جديدة.
          </Alert>
        ) : !p.email_matches ? (
          <Alert tone="warn">
            هذه الدعوة لبريد إلكتروني آخر. أنت داخل بالبريد <span className="ltr">{user.email}</span>. اخرج وادخل بالبريد المدعو.
          </Alert>
        ) : (
          <>
            <p>
              دُعيت للانضمام إلى <b>{p.workspace_name}</b> بدور <b>{ROLE[p.role] ?? p.role}</b>.
            </p>
            <AcceptButton token={token} />
          </>
        )}
      </Card>
    </div>
  );
}
