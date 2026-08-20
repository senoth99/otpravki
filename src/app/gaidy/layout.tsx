import { GuidesShell } from "@/components/guides/GuidesShell";
import { listGuides } from "@/lib/server/guides-store";

export const dynamic = "force-dynamic";

export default async function GaidyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const guides = await listGuides();
  return <GuidesShell initialGuides={guides}>{children}</GuidesShell>;
}
