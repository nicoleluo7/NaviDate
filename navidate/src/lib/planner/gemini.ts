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
  // Prune trips that cannot fit before paying for a route.
  const points = [
    c.start,
    ...sequence.map((p) => p.coordinates),
    ...(c.returnToStart ? [c.start] : []),
  ];
  const km = points
    .slice(1)
    .reduce((sum, p, i) => sum + distance(points[i], p), 0);
  const driving = c.transport === "drive";
  const speedKmh = driving ? 25 : 5;
  return (
    (driving || c.unrestricted?.includes("distance") || km <= c.maxWalkKm) &&
    (km / speedKmh) * 60 +
      sequence.reduce((sum, p) => sum + p.typicalDurationMinutes, 0) <=
      c.duration
  );
}
function straightTravel(sequence: Place[], c: Criteria) {
  const points = [
    c.start,
    ...sequence.map((p) => p.coordinates),
    ...(c.returnToStart ? [c.start] : []),
  ];
  const km = points
    .slice(1)
    .reduce((sum, p, i) => sum + distance(points[i], p), 0);
  const speed = c.transport === "drive" ? 25 : 5;
  return { km, minutes: (km / speed) * 60 };
}
function visitFloor(place: Place) {
  return place.category === "food" ? 45 : 20;
}
function fitStopMinutes(sequence: Place[], c: Criteria, extra = 0) {
  const travel = straightTravel(sequence, c).minutes;
  const reserve =
    travel +
    (sequence.length + (c.returnToStart ? 1 : 0)) *
      (c.transport === "drive" ? 8 : 5) +
    extra;
  const floors = sequence.map(visitFloor);
  if (floors.reduce((sum, minutes) => sum + minutes, 0) + reserve > c.duration)
    return null;
  const minutes = sequence.map((p) => p.typicalDurationMinutes);
  let cut =
    minutes.reduce((sum, value) => sum + value, 0) + reserve - c.duration;
  while (cut > 0) {
    let index = -1,
      slack = 0;
    minutes.forEach((value, i) => {
      const room = value - floors[i];
      if (room > slack) {
        slack = room;
        index = i;
      }
    });
    if (index < 0) return null;
    const step = Math.min(slack, cut);
    minutes[index] -= step;
    cut -= step;
  }
  return sequence.map((place, i) => ({
    ...place,
    typicalDurationMinutes: Math.max(floors[i], Math.floor(minutes[i])),
  }));
}
function structurallyBlocked(sequence: Place[], c: Criteria) {
  if (
    sequence.length < 2 ||
    new Set(sequence.map((p) => p.id)).size !== sequence.length
  )
    return "Use two or three different stops.";
  if (
    sequence.filter((p) => p.category === "food").length > 1 ||
    sequence.filter((p) => p.category === "café").length > 1
  )
    return "Use only one restaurant and only one café.";
  if (!sequence.some((p) => matchesDateType(p, c.dateType)))
    return typeRepair(c.dateType);
  if (c.restaurantId && !sequence.some((p) => p.id === c.restaurantId))
    return "Keep the restaurant the user selected.";
  const { km } = straightTravel(sequence, c);
  if (
    c.transport !== "drive" &&
    !c.unrestricted?.includes("distance") &&
    km > c.maxWalkKm
  )
    return "Stops are farther apart than the walking limit. Choose closer places.";
  return "";
}
function twoStopsCanFit(c: Criteria) {
  const hop = c.transport === "drive" ? 10 : 15;
  return (c.dateType === "food" ? 45 : 20) + 20 + hop <= c.duration;
}
function typeRepair(dateType: Criteria["dateType"]) {
  const need = {
    food: "exactly one stop whose category is food. A café does not count.",
    coffee: "a stop whose category is café.",
    dessert:
      "a stop whose category is dessert, such as a bakery or ice cream shop.",
    outdoors: "an outdoor stop.",
    any: "the requested kind of stop.",
  }[dateType];
  return `Missing required ${dateType} stop. Include ${need}`;
}
function typeError(dateType: Criteria["dateType"]) {
  const name = {
    food: "a restaurant",
    coffee: "a coffee stop",
    dessert: "a dessert stop",
    outdoors: "an outdoor stop",
    any: "a matching stop",
  }[dateType];
  return `No ${name} nearby fits this time, budget, and route. Try Surprise me, a little more time, or a higher budget.`;
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
    router = options.router ?? createPlannerRouter(criteria.transport);
  const valid: Plan[] = [],
    feedback: { stops: string[]; reason: string }[] = [],
    notices: string[] = [];
  async function timedPlan(sequence: Place[]) {
    let penalty = 0,
      reason = "No feasible schedule";
    for (let pass = 0; pass < 3; pass++) {
      const fitted = fitStopMinutes(sequence, criteria, penalty);
      if (!fitted)
        return {
          plan: null,
          reason: `Activity plus travel must finish within ${criteria.duration} minutes. Use about 45 minutes for a meal and 20 to 30 for the other stop.`,
        };
      const plan = await schedule(criteria, fitted, {
        ...options,
        router,
        weather,
        onReject: (next) => {
          reason = next;
        },
      });
      if (plan) return { plan, reason };
      const needed = Number(reason.match(/needs ([\d.]+) minutes/)?.[1]);
      if (!Number.isFinite(needed) || needed <= criteria.duration)
        return { plan: null, reason };
      penalty += Math.ceil(needed - criteria.duration);
    }
    return { plan: null, reason };
  }
  if (catalog.length < 2)
    return {
      plans: [],
      ai: false,
      notices: [],
      error:
        "Not enough nearby places fit these preferences and estimated budget. Increase the budget or walking distance, or allow both indoor and outdoor stops.",
    };
  if (
    criteria.dateType !== "any" &&
    !catalog.some((place) => matchesDateType(place, criteria.dateType))
  )
    return {
      plans: [],
      ai: true,
      notices: [],
      error: typeError(criteria.dateType),
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
      const blocked = structurallyBlocked(sequence, criteria);
      if (blocked) {
        feedback.push({
          stops: sequence.map((p) => p.id),
          reason: blocked,
        });
        continue;
      }
      const timed = await timedPlan(sequence);
      if (!timed.plan) {
        feedback.push({
          stops: sequence.map((p) => p.id),
          reason: timed.reason,
        });
        continue;
      }
      const plan = timed.plan;
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
  if (!valid.length && !twoStopsCanFit(criteria)) {
    const singles = catalog
      .filter((place) => matchesDateType(place, criteria.dateType))
      .filter(
        (place) => !criteria.restaurantId || place.id === criteria.restaurantId,
      )
      .sort(
        (a, b) =>
          distance(criteria.start, a.coordinates) -
          distance(criteria.start, b.coordinates),
      )
      .slice(0, 6);
    for (const place of singles) {
      const timed = await timedPlan([place]);
      if (!timed.plan || valid.some((plan) => plan.id === timed.plan!.id))
        continue;
      valid.push({
        ...timed.plan,
        title: place.name,
        explanation: `One stop, so it fits in ${criteria.duration} minutes.`,
      });
      if (valid.length === 3) break;
    }
    if (valid.length)
      notices.push(
        "Two stops do not fit this amount of time, so these plans are a single stop.",
      );
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
  if (
    criteria.transport === "bus" &&
    !valid.some((p) => p.legs.some((l) => l.mode === "bus"))
  )
    notices.push(
      "No catchable, verified direct bus schedule was available. These options use walking.",
    );
  const useful = feedback.find(
    (item) =>
      !item.reason.startsWith("Missing required") &&
      !item.reason.startsWith("Activity plus travel") &&
      !item.reason.startsWith("Use only one restaurant") &&
      !item.reason.startsWith("Keep the restaurant") &&
      !item.reason.startsWith("Stops are farther") &&
      !item.reason.startsWith("Use two or three"),
  );
  return {
    plans: valid,
    ai: true,
    notices,
    ...(!valid.length
      ? {
          error:
            useful?.reason ??
            (feedback.some((item) =>
              item.reason.startsWith("Missing required"),
            )
              ? typeError(criteria.dateType)
              : !twoStopsCanFit(criteria)
                ? criteria.dateType === "food"
                  ? `A meal and another stop need more than ${criteria.duration} minutes once travel is included. Try 2 hours.`
                  : `Two stops do not fit in ${criteria.duration} minutes once travel is included. Add more time together.`
                : feedback.some((item) =>
                      item.reason.startsWith("Keep the restaurant"),
                    )
                  ? "The restaurant you picked could not stay in a plan that fits. Try another one, or Surprise me."
                  : "No suitable combination fits. Try a different time, more time together, or a larger budget."),
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
    router = createPlannerRouter(criteria.transport);
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
