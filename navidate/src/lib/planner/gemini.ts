import type { Criteria, Place, Plan, PlanResult } from "@/types";
import {
  generateDatePlan,
  type GeminiDatePlan,
} from "@/lib/integrations/gemini";
import { categoryFrom, resolveStop } from "@/lib/maps/places";
import { googleMapsServerKey, normalizePlaceId } from "@/lib/maps/config";
import { schedule, type PlannerOptions } from ".";

function matchGrounding(
  stop: GeminiDatePlan["stops"][number],
  chunks: { title: string; placeId: string; uri?: string }[],
) {
  const id = stop.placeId ? normalizePlaceId(stop.placeId) : "";
  return (
    chunks.find((chunk) => normalizePlaceId(chunk.placeId) === id) ??
    chunks.find(
      (chunk) =>
        chunk.title &&
        (chunk.title.toLowerCase() === stop.name.toLowerCase() ||
          chunk.title.toLowerCase().includes(stop.name.toLowerCase()) ||
          stop.name.toLowerCase().includes(chunk.title.toLowerCase())),
    )
  );
}

async function placesFromGemini(
  criteria: Criteria,
  draft: GeminiDatePlan,
  chunks: { title: string; placeId: string; uri?: string }[],
) {
  const resolved: Place[] = [];
  for (const stop of draft.stops) {
    const grounded = matchGrounding(stop, chunks);
    const found = await resolveStop(
      {
        name: stop.name,
        address: stop.address,
        placeId: grounded?.placeId ?? stop.placeId,
      },
      criteria.start,
    );
    if (!found) continue;
    if (resolved.some((place) => place.id === found.googlePlaceId)) continue;
    const category = categoryFrom(stop.category || found.name);
    const indoorOutdoor =
      stop.indoorOutdoor ??
      (category === "park" || category === "free" ? "outdoor" : "indoor");
    resolved.push({
      id: found.googlePlaceId,
      name: found.name,
      category,
      coordinates: { lat: found.lat, lng: found.lng },
      address: found.address,
      description: stop.reason || found.address,
      vibeTags: [criteria.vibe],
      indoorOutdoor,
      estimatedCostForTwo: stop.estimatedCostForTwo,
      typicalDurationMinutes: stop.estimatedDurationMinutes,
      dietaryTags: [],
      openingHours: null,
      websiteUrl: found.websiteUrl ?? found.googleMapsUri,
      sourceUrl: found.googleMapsUri,
      googlePlaceId: found.googlePlaceId,
      googleMapsUri: found.googleMapsUri,
      verifiedAt: new Date().toISOString().slice(0, 10),
      verificationStatus: "needs-verification",
    });
  }
  return resolved;
}

export async function planWithGemini(
  criteria: Criteria,
  options: PlannerOptions = {},
): Promise<PlanResult> {
  if (!googleMapsServerKey())
    throw new Error("Google Maps is not configured");
  const { plans: drafts, chunks } = await generateDatePlan(
    criteria,
    options.seed ?? 0,
  );
  const valid: Plan[] = [];
  const notices: string[] = [];
  for (const draft of drafts) {
    let places = await placesFromGemini(criteria, draft, chunks);
    while (places.length > 2) {
      const plan = await schedule(criteria, places, options);
      if (plan) {
        valid.push({
          ...plan,
          title: draft.title,
          explanation: draft.explanation,
        });
        break;
      }
      places = places.slice(0, -1);
    }
    if (places.length === 2) {
      const plan = await schedule(criteria, places, options);
      if (plan)
        valid.push({
          ...plan,
          title: draft.title,
          explanation: draft.explanation,
        });
    }
  }
  if (!valid.length)
    return {
      plans: [],
      notices: [
        "Gemini suggested ideas, but none could be verified as real Google Maps places that fit the time and budget.",
      ],
      ai: true,
    };
  notices.push(
    "Gemini planned this date. Stops and walking lines are from Google Maps. Confirm hours and prices before you go.",
  );
  return { plans: valid.slice(0, 3), notices, ai: true };
}
