import type { SavedDate } from "@/types";
import { getStorage } from "@/lib/storage";
import { publicPlan } from "@/lib/storage/dates";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const saved = await getStorage().get<SavedDate>("date:" + shareId);
  return saved
    ? Response.json(
        { shareId, plan: publicPlan(saved.plan) },
        { headers: { "Cache-Control": "no-store" } },
      )
    : Response.json({ error: "Itinerary not found." }, { status: 404 });
}
// Editing uses authenticated creator drafts and /api/save. Public links confer no mutation capability.
export async function PATCH() {
  return Response.json(
    { error: "Read-only itinerary. Use the creator editing experience." },
    { status: 403 },
  );
}
