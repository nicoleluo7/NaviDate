import { notFound } from "next/navigation";
import type { SavedDate } from "@/types";
import { getStorage } from "@/lib/storage";
import { isOwner } from "@/lib/storage/dates";
import { session } from "@/lib/api";
import Planner from "@/components/planner/Planner";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Edit your date · Navidate",
  robots: { index: false, follow: false },
};
export default async function Edit({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const record = await getStorage().get<SavedDate>("date:" + shareId);
  if (!record) notFound();
  if (!isOwner(record, await session()))
    return (
      <main className="empty">
        <h1>This date is read-only.</h1>
        <p>Editing is available only in the browser that created it.</p>
        <a className="primary" href={"/date/" + shareId}>
          View itinerary
        </a>
      </main>
    );
  return (
    <Planner
      initialCriteria={record.criteria}
      editingShareId={shareId}
      ai={!!process.env.XAI_API_KEY}
      photon={
        !!(
          process.env.SPECTRUM_PROJECT_ID &&
          process.env.SPECTRUM_PROJECT_SECRET &&
          process.env.PHOTON_AGENT_ADDRESS
        )
      }
    />
  );
}
