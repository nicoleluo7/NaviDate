import type { Criteria, Place, Plan, PlanResult } from "@/types";
import { discoverPlaces, discoverPlaceById } from "@/lib/maps/discovery";
import { recommend, type Recommendation } from "./recommendations";
import { fitsHours } from "./hours";
import { localTime } from "./time";
import { matchesDateType, schedule, type PlannerOptions } from ".";
import { favorsIndoors, unavailableWeather } from "@/lib/integrations/weather";
import { distance } from "@/lib/routing";
import { createPlannerRouter } from "@/lib/maps/routes";

export function eligiblePlaces(criteria: Criteria, places: Place[]) {
  const start = localTime(criteria.date, criteria.time),
    end = start + criteria.duration * 60000;
  return places.filter(
    (p) =>
      (criteria.unrestricted?.includes("budget") ||
        p.estimatedCostForTwo <= criteria.budget) &&
      (criteria.setting === "any" || criteria.setting === p.indoorOutdoor) &&
      Array.from(
        { length: Math.max(1, Math.ceil(criteria.duration / 10)) },
        (_, i) => start + i * 600000,
      ).some(
        (at) =>
          at + (p.category === "food" ? 45 : 20) * 60000 <= end &&
          fitsHours(p, at, at + (p.category === "food" ? 45 : 20) * 60000),
      ),
  );
}
export function materialize(draft: Recommendation, catalog: Place[]): Place[] {
  return draft.stops.map((s) => {
    const p = catalog.find((p) => p.id === s.placeId);
    if (!p) throw new Error("Unknown place ID");
    return {
      ...p,
      description: s.activity,
      typicalDurationMinutes: Math.max(
        p.category === "food" ? 45 : 20,
        s.minutes,
      ),
    };
  });
}
export function coherent(sequence: Place[], c: Criteria) {
  if (
    sequence.length < 2 ||
    new Set(sequence.map((p) => p.id)).size !== sequence.length
  )
    return false;
  if (
    sequence.filter((p) => p.category === "food").length > 1 ||
    sequence.filter((p) => p.category === "café").length > 1
  )
    return false;
  if (!sequence.some((p) => matchesDateType(p, c.dateType))) return false;
  if (c.restaurantId && !sequence.some((p) => p.id === c.restaurantId))
    return false;
  // Prune physically implausible walking requests before paid route calls.
  const points = [
    c.start,
    ...sequence.map((p) => p.coordinates),
    ...(c.returnToStart ? [c.start] : []),
  ];
  const km = points
    .slice(1)
    .reduce((sum, p, i) => sum + distance(points[i], p), 0);
  return (
    (c.unrestricted?.includes("distance") || km <= c.maxWalkKm) &&
    (km / 5) * 60 +
      sequence.reduce((sum, p) => sum + p.typicalDurationMinutes, 0) <=
      c.duration
  );
}
export async function planWithGemini(
  criteria: Criteria,
  options: PlannerOptions = {},
): Promise<PlanResult> {
  const discovered = [...(options.places ?? (await discoverPlaces(criteria)))];
  if (
    criteria.restaurantId &&
    !discovered.some((p) => p.id === criteria.restaurantId)
  ) {
    const chosen = await discoverPlaceById(criteria.restaurantId);
    if (chosen) discovered.push(chosen);
  }
  const catalog = eligiblePlaces(criteria, discovered);
  if (
    criteria.restaurantId &&
    !catalog.some(
      (p) => p.id === criteria.restaurantId && p.category === "food",
    )
  )
    return {
      plans: [],
      ai: false,
      notices: [],
      error:
        "Your selected restaurant doesn't fit these hours, budget or setting. Choose another restaurant or adjust your preferences.",
    };
  const weather = options.weather ?? unavailableWeather(),
    router = options.router ?? createPlannerRouter();
  const valid: Plan[] = [],
    feedback: { stops: string[]; reason: string }[] = [];
  if (catalog.length < 2)
    return {
      plans: [],
      ai: false,
      notices: [],
      error:
        "Not enough nearby places fit these preferences and estimated budget. Increase the budget or walking distance, or allow both indoor and outdoor stops.",
    };
  for (let attempt = 0; attempt < 2; attempt++) {
    const drafts = await recommend(
      criteria,
      catalog,
      weather,
      options.seed ?? 0,
      feedback,
    );
    for (const draft of drafts) {
      const sequence = materialize(draft, catalog);
      if (!coherent(sequence, criteria)) {
        feedback.push({
          stops: sequence.map((p) => p.id),
          reason: !sequence.some((p) => matchesDateType(p, criteria.dateType))
            ? `Missing required ${criteria.dateType} stop. For Food include a venue whose category is food.`
            : criteria.restaurantId &&
                !sequence.some((p) => p.id === criteria.restaurantId)
              ? "Missing the restaurant selected by the user."
              : "Repeated main activity or too much travel/activity time for this request.",
        });
        continue;
      }
      let reason = "No feasible schedule";
      const plan = await schedule(criteria, sequence, {
        ...options,
        router,
        weather,
        onReject: (r) => {
          reason = r;
        },
      });
      if (!plan) {
        feedback.push({ stops: sequence.map((p) => p.id), reason });
        continue;
      }
      if (
        valid.some((p) => {
          const ids = new Set(p.stops.map((s) => s.place.id));
          return (
            sequence.filter((s) => ids.has(s.id)).length ===
            Math.min(sequence.length, ids.size)
          );
        })
      )
        continue;
      valid.push({
        ...plan,
        title: draft.title,
        explanation: draft.explanation,
      });
      if (valid.length === 3) break;
    }
    if (valid.length || !drafts.length) break;
  }
  if (favorsIndoors(weather)) {
    const outdoorMinutes = (p: Plan) =>
      p.stops
        .filter((s) => s.place.indoorOutdoor === "outdoor")
        .reduce((n, s) => n + s.place.typicalDurationMinutes, 0);
    valid.sort(
      (a, b) => outdoorMinutes(a) - outdoorMinutes(b) || a.walkKm - b.walkKm,
    );
  }
  const notices: string[] = [];
  if (
    criteria.transport === "bus" &&
    !valid.some((p) => p.legs.some((l) => l.mode === "bus"))
  )
    notices.push(
      "No catchable, verified direct bus schedule was available. These options use walking.",
    );
  return {
    plans: valid,
    ai: true,
    notices,
    ...(!valid.length
      ? {
          error:
            feedback[0]?.reason ??
            "No suitable combination fits. Try a different time, more time together, or a larger budget.",
        }
      : {}),
  };
}
export async function swapWithGemini(
  plans: Plan[],
  planId: string,
  index: number,
  criteria: Criteria,
) {
  const old = plans.find((p) => p.id === planId);
  if (!old?.stops[index]) return null;
  const discovered = await discoverPlaces(criteria);
  const catalog = eligiblePlaces(criteria, [
    ...old.stops.map((s) => s.place),
    ...discovered.filter((p) => !old.stops.some((s) => s.place.id === p.id)),
  ]);
  const feedback = {
    task: "Replace exactly one stop. Preserve all other stops and their order. Do not use the replaced place. Suggest up to six alternatives.",
    replaceIndex: index,
    oldStops: old.stops.map((s) => s.place.id),
  };
  const drafts = await recommend(criteria, catalog, old.weather, 0, feedback),
    router = createPlannerRouter();
  for (const draft of drafts) {
    const ids = draft.stops.map((s) => s.placeId);
    if (
      ids.length !== old.stops.length ||
      ids[index] === old.stops[index].place.id ||
      old.stops.some((s, i) => i !== index && ids[i] !== s.place.id)
    )
      continue;
    const proposed = materialize(draft, catalog).map((p, i) =>
      i === index ? p : old.stops[i].place,
    );
    if (!coherent(proposed, criteria)) continue;
    const p = await schedule(criteria, proposed, {
      router,
      weather: old.weather,
    });
    if (!p || plans.some((x) => x.id === p.id)) continue;
    const plan = { ...p, title: draft.title, explanation: draft.explanation };
    return { plan, plans: plans.map((p) => (p.id === planId ? plan : p)) };
  }
  return null;
}
