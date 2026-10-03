import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "lucide-react";
import type { SavedDate } from "@/types";
import { getStorage } from "@/lib/storage";
import { publicPlan } from "@/lib/storage/dates";
import Itinerary from "@/components/itinerary/Itinerary";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "A date to look forward to · Navidate",
  robots: { index: false, follow: false },
};
export default async function Shared({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const record = await getStorage().get<SavedDate>("date:" + shareId);
  if (!record) notFound();
  return (
    <>
      <header className="site-header">
        <Link href="/" className="logo">
          <Navigation />
          navidate
        </Link>
        <Link href="/" className="nav-cta">
          Plan your own date ↗
        </Link>
      </header>
      <main>
        <p className="share-banner">
          A date to look forward to.{" "}
          <strong>Read-only shared itinerary.</strong>
        </p>
        <Itinerary
          plan={publicPlan(record.plan)}
          savedUrl={`${process.env.APP_URL ?? "http://localhost:3000"}/date/${shareId}`}
        />
        <p className="saved-note">
          <a href={"/edit/" + shareId}>Creator? Open your editing page ↗</a>
        </p>
      </main>
    </>
  );
}
