import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/brand/SiteHeader";
import NaviMascot from "@/components/brand/NaviMascot";
import { session } from "@/lib/api";
import { isOwner } from "@/lib/storage/dates";
import type { SavedDate } from "@/types";
import { getStorage } from "@/lib/storage";
import { publicPlan } from "@/lib/storage/dates";
import Itinerary from "@/components/itinerary/Itinerary";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your date is ready · NaviDate",
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
  const plan = publicPlan(record.plan);
  return (
    <>
      <SiteHeader ctaHref="/?new=1" ctaLabel="Plan your own date" />
      <main className="invitation">
        <div className="invitation-hero">
          <NaviMascot state="happy" size={120} />
          <p className="eyebrow">NaviDate</p>
          <h1>Your date is ready 💌</h1>
          <p className="share-banner">
            A date to look forward to.{" "}
            <strong>Read-only shared itinerary.</strong>
          </p>
        </div>
        {isOwner(record, await session()) && (
          <p className="share-banner">
            <Link className="secondary" href={`/?date=${shareId}`}>
              Edit this date
            </Link>
          </p>
        )}
        <Itinerary
          variant="share"
          plan={plan}
          savedUrl={`${process.env.APP_URL ?? "http://localhost:3000"}/date/${shareId}`}
        />
        <p className="invitation-cta">
          <Link className="secondary" href="/?new=1">
            Plan your own date
          </Link>
        </p>
      </main>
    </>
  );
}
