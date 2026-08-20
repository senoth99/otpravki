import { notFound } from "next/navigation";
import { GuideArticle } from "@/components/guides/GuideArticle";
import { GuideLockGate } from "@/components/guides/guides-lock";
import { getGuide } from "@/lib/server/guides-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = await getGuide(slug);
  return {
    title: guide ? `${guide.title} | Гайды` : "Гайд | CASHER",
  };
}

export default async function GuideSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) notFound();
  return (
    <GuideLockGate slug={guide.slug}>
      <GuideArticle guide={guide} />
    </GuideLockGate>
  );
}
