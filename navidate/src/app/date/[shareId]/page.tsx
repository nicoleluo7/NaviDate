import { publicAppUrl } from "@/lib/urls";
import Link from "next/link";
import { notFound } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { session } from "@/lib/api";
import { isOwner } from "@/lib/storage/dates";
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
          <BrandMark />
          navidate
        </Link>
        <Link href="/?new=1" className="nav-cta">
          Plan your own date ↗
        </Link>
      </header>
      <main>
        <p className="share-banner">
          A date to look forward to.{" "}
          <strong>Read-only shared itinerary.</strong>
        </p>
        {isOwner(record, await session()) && (
          <p className="share-banner">
            <Link className="secondary" href={`/?date=${shareId}`}>
              Edit this date
            </Link>
          </p>
        )}
        <Itinerary
          plan={publicPlan(record.plan)}
          savedUrl={`${publicAppUrl()}/date/${shareId}`}
        />
      </main>
    </>
  );
}
