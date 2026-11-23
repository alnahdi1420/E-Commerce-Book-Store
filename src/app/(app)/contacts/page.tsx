import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentWorkspace, requireUser } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { ContactBook } from "@/components/contact-book";

export const metadata: Metadata = { title: "دفتر العناوين" };

export default async function ContactsPage() {
  const { supabase } = await requireUser();
  const ws = await getCurrentWorkspace();
  if (ws.role === "viewer") redirect("/events");
  const { data } = await supabase.from("contacts").select("id, name, phone_e164").eq("workspace_id", ws.workspace_id).order("name").limit(5000);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageTitle
        title="دفتر العناوين"
        subtitle="اختياري: احفظ من تدعوهم كثيرًا لتضيفهم لأي مناسبة بضغطة. لا يُشارك خارج مساحة العمل."
      />
      <ContactBook contacts={data ?? []} />
    </div>
  );
}
