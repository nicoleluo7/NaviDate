import { createHash } from "node:crypto";
import {
  criteriaSchema,
  type Criteria,
  type Place,
  type Plan,
  type PlanResult,
  type Weather,
  type Leg,
} from "@/types";
import { places, transit } from "@/lib/data";
import {
  createWalkingRouter,
  localWalk,
  distance,
  type WalkingRouter,
} from "@/lib/routing";
import { directTrips, type TransitData, type WalkLookup } from "@/lib/transit";
import { localTime, iso } from "./time";
import { fitsHours } from "./hours";
import {
  favorsIndoors,
  weatherForWindow,
  unavailableWeather,
} from "@/lib/integrations/weather";
import { buildGoogleMapsRouteUrl } from "@/lib/maps/googleMapsUrl";
export type PlannerOptions = {
  places?: Place[];
  router?: WalkingRouter;
  transit?: TransitData;
  weather?: Weather;
  sequences?: string[][];
  exclude?: string[];
  seed?: number;
  walkLookup?: WalkLookup;
  allowDemo?: boolean;
  onReject?: (reason: string) => void;
};
export function matchesDateType(place: Place, type: Criteria["dateType"]) {
  return (
    !type ||
    type === "any" ||
    (type === "coffee" && place.category === "café") ||
    (type === "food" && place.category === "food") ||
    (type === "dessert" && place.category === "dessert") ||
    (type === "outdoors" && place.indoorOutdoor === "outdoor")
  );
}
export async function schedule(
  c: Criteria,
  sequence: Place[],
  options: PlannerOptions = {},
): Promise<Plan | null> {
  const budgetLimit = c.unrestricted?.includes("budget") ? Infinity : c.budget;
  const walkLimit = c.unrestricted?.includes("distance")
    ? Infinity
    : c.maxWalkKm;
  const router = options.router ?? createWalkingRouter(),
    busData = options.transit ?? transit;
  const reject = (reason: string) => {
    options.onReject?.(reason);
    return null;
  };
  if (
    sequence.some((p) => c.setting !== "any" && p.indoorOutdoor !== c.setting)
  )
    return reject(
      "This combination does not match your indoor/outdoor preference.",
    );
  if (sequence.some((p) => p.estimatedCostForTwo > budgetLimit))
    return reject("An activity exceeds the budget for two.");
  if (!sequence.some((p) => matchesDateType(p, c.dateType)))
    return reject(
      "No available stop matches this date type. Try Surprise me, a different start time, or a higher budget.",
    );
  if (c.restaurantId && !sequence.some((p) => p.id === c.restaurantId))
    return reject("The selected restaurant is missing from this combination.");
  const start = localTime(c.date, c.time);
  let now = start,
    cost = 0,
    walkKm = 0;
  const legs: Leg[] = [],
    stops: Plan["stops"] = [];
  let from = { ...c.start };
  for (const target of [
    ...sequence.map((p) => ({
      ...p.coordinates,
      id: p.id,
      name: p.name,
      private: false,
      googlePlaceId: p.googlePlaceId,
    })),
    ...(c.returnToStart ? [c.start] : []),
  ]) {
    const walking = await router.route(from, target);
    const buses =
      c.transport === "bus"
        ? directTrips(
            busData,
            from,
            target,
            now,
            options.walkLookup ?? localWalk,
            5,
            options.allowDemo ?? false,
          )
        : [];
    const bus = buses.find(
      (b) =>
        (b.end < now + (walking?.minutes ?? Infinity) * 60000 ||
          walkKm + (walking?.km ?? Infinity) > walkLimit) &&
        cost +
          b.route.fareForTwo +
          sequence
            .slice(stops.length)
            .reduce((n, p) => n + p.estimatedCostForTwo, 0) <=
          budgetLimit &&
        walkKm + b.before.km + b.after.km <= walkLimit,
    );
    let leg: Leg;
    if (bus) {
      leg = {
        mode: "bus",
        from,
        to: target,
        fromName: from.name,
        toName: target.name,
        departure: iso(now),
        arrival: iso(bus.end),
        minutes: (bus.end - now) / 60000,
        walkKm: bus.before.km + bus.after.km,
        cost: bus.route.fareForTwo,
        label: "Scheduled bus · not live",
        bus: {
          route: bus.route.number,
          tripId: bus.trip.id,
          boarding: bus.board.name,
          alighting: bus.alight.name,
          wait: bus.wait,
          ride: (bus.arrival - bus.departure) / 60000,
          boardTime: iso(bus.departure),
          alightTime: iso(bus.arrival),
          boardingPoint: bus.board.coordinates,
          alightingPoint: bus.alight.coordinates,
          serviceDate: bus.serviceDate,
          demo: bus.trip.demo,
        },
      };
    } else if (walking) {
      leg = {
        mode: "walk",
        from,
        to: target,
        fromName: from.name,
        toName: target.name,
        departure: iso(now),
        arrival: iso(now + walking.minutes * 60000),
        minutes: walking.minutes,
        walkKm: walking.km,
        cost: 0,
        label: walking.label,
        geometry: walking.geometry,
        encodedPolyline: walking.encodedPolyline,
      };
    } else
      return reject(
        "No supported walking route or catchable direct bus. Choose a supported starting landmark.",
      );
    legs.push(leg);
    now = Date.parse(leg.arrival);
    cost += leg.cost;
    walkKm += leg.walkKm;
    const place = sequence[stops.length];
    if (place) {
      const end = now + place.typicalDurationMinutes * 60000;
      if (!fitsHours(place, now, end))
        return reject(
          "An activity would finish outside published opening hours. Try a 13:00 start.",
        );
      stops.push({ place, arrival: iso(now), departure: iso(end) });
      cost += place.estimatedCostForTwo;
      now = end;
    }
    from = { ...target, private: target.private ?? false };
  }
  if (cost > budgetLimit)
    return reject(
      `Budget: this combination needs an estimated $${cost} for two. Increase the budget or choose free activities.`,
    );
  if ((now - start) / 60000 > c.duration)
    return reject(
      `Duration: this combination needs ${(now - start) / 60000} minutes including travel. Add 45 minutes.`,
    );
  if (walkKm > walkLimit)
    return reject(
      `Walking: this combination needs ${walkKm.toFixed(1)} km. Increase the walking limit or start closer.`,
    );
  const weather = weatherForWindow(
    options.weather ?? unavailableWeather(),
    start,
    now,
  );
  for (const stop of stops) {
    if (
      stop.place.indoorOutdoor === "outdoor" &&
      weatherForWindow(
        options.weather ?? unavailableWeather(),
        Date.parse(stop.arrival),
        Date.parse(stop.departure),
      ).severe
    )
      return reject(
        "Storms or strong wind overlap an outdoor activity. Choose indoor activities or another time.",
      );
  }
  const warnings = [
    "Costs are planning estimates for two, not quotes. Confirm current prices.",
  ];
  if (sequence.some((p) => !p.openingHours))
    warnings.push(
      "Some opening hours are unverified. Confirm availability before heading out.",
    );
  if (legs.some((l) => l.mode === "walk" && !l.geometry && l.minutes > 0))
    warnings.push(
      "Walking times use a curated estimate graph. Paths have not been field-verified; route lines are unavailable.",
    );
  if (c.dietary.length)
    warnings.push(
      "Dietary needs were not verified with venues. Confirm ingredients and cross-contact directly.",
    );
  if (legs.some((l) => l.bus?.demo))
    warnings.push(
      "DEMO BUS SCHEDULE: fictional service; do not use for travel.",
    );
  if (favorsIndoors(weather) && weather.advice) warnings.push(weather.advice);
  const outdoor = sequence.some((p) => p.indoorOutdoor === "outdoor");
  const id = createHash("sha256")
    .update(JSON.stringify([c, sequence.map((p) => p.id)]))
    .digest("hex")
    .slice(0, 20);
  return {
    id,
    title:
      sequence[0].category === "culture"
        ? "A little art, a little us"
        : sequence.every((p) => p.estimatedCostForTwo === 0)
          ? "Good company, zero cover"
          : sequence.some((p) => p.category === "dessert")
            ? "Take the sweet way home"
            : sequence.some((p) => p.category === "café")
              ? "Coffee & a little wandering"
              : "Your kind of afternoon",
    explanation: `${sequence.map((p) => p.name).join(" → ")}. A ${c.vibe.toLowerCase()} escape with time to enjoy each stop.`,
    start: c.start,
    startsAt: iso(start),
    endsAt: iso(now),
    stops,
    legs,
    cost,
    duration: (now - start) / 60000,
    walkKm: Math.round(walkKm * 100) / 100,
    warnings,
    weather: { ...weather, hours: options.weather?.hours ?? weather.hours },
    suitability: outdoor
      ? favorsIndoors(weather)
        ? "Outdoor stops · weather caution"
        : "Outdoor stops · weather dependent"
      : "Indoor activities · outdoor travel",
    googleMapsUrl: buildGoogleMapsRouteUrl({
      start: c.start,
      stops: sequence.map((place) => ({
        name: place.name,
        address: place.address,
        lat: place.coordinates.lat,
        lng: place.coordinates.lng,
        googlePlaceId: place.googlePlaceId,
      })),
      transport: legs.some((l) => l.mode === "bus") ? "bus" : "walk",
      returnToStart: c.returnToStart,
    }),
  };
}
export async function planDates(
  input: unknown,
  options: PlannerOptions = {},
): Promise<PlanResult> {
  const c = criteriaSchema.parse(input);
  localTime(c.date, c.time);
  const all = options.places ?? places;
  const pool = all
    .filter(
      (p) =>
        !options.exclude?.includes(p.id) &&
        (c.setting === "any" || p.indoorOutdoor === c.setting) &&
        (c.unrestricted?.includes("budget") ||
          p.estimatedCostForTwo <= c.budget),
    )
    .sort(
      (a, b) =>
        (favorsIndoors(options.weather) && c.setting === "any"
          ? Number(b.indoorOutdoor === "indoor") -
            Number(a.indoorOutdoor === "indoor")
          : 0) ||
        Number(matchesDateType(b, c.dateType)) -
          Number(matchesDateType(a, c.dateType)) ||
        distance(a.coordinates, c.start) - distance(b.coordinates, c.start),
    )
    .slice(0, 12);
  const sequences: Place[][] = [];
  for (const ids of options.sequences ?? []) {
    const seq = ids.map((id) => pool.find((p) => p.id === id));
    if (
      seq.length >= 2 &&
      seq.length <= 3 &&
      seq.every((p): p is Place => !!p) &&
      new Set(ids).size === ids.length
    )
      sequences.push(seq);
  }
  for (const a of pool)
    for (const b of pool)
      if (a.id !== b.id) {
        sequences.push([a, b]);
        const third = pool.find(
          (p) =>
            p.id !== a.id &&
            p.id !== b.id &&
            p.category !== a.category &&
            p.category !== b.category,
        );
        if (third) sequences.push([a, b, third]);
      }
  const router = options.router ?? createWalkingRouter(),
    valid: Plan[] = [],
    reasons = new Map<string, number>();
  for (const seq of sequences.slice(0, 300)) {
    const p = await schedule(c, seq, {
      ...options,
      router,
      onReject: (reason) => reasons.set(reason, (reasons.get(reason) ?? 0) + 1),
    });
    if (p) valid.push(p);
  }
  const seed = options.seed ?? 0;
  const score = (p: Plan) =>
    (c.unrestricted?.includes("vibe")
      ? 0
      : p.stops.filter((s) => s.place.vibeTags.includes(c.vibe)).length * 10) +
    new Set(p.stops.map((s) => s.place.category)).size * 5 -
    (favorsIndoors(p.weather)
      ? p.stops
          .filter((s) => s.place.indoorOutdoor === "outdoor")
          .reduce((n, s) => n + s.place.typicalDurationMinutes, 0) *
          2 +
        p.walkKm * 8
      : 0) -
    p.walkKm * 3 -
    p.cost / 30 +
    ((parseInt(p.id.slice(0, 4), 16) + seed * 997) % 17) / 8;
  valid.sort((a, b) => score(b) - score(a));
  const selected: Plan[] = [];
  for (const p of valid) {
    if (
      selected.every((other) => {
        const ids = new Set(other.stops.map((s) => s.place.id));
        const overlap = p.stops.filter((s) => ids.has(s.place.id)).length;
        return (
          overlap < Math.min(p.stops.length, other.stops.length) &&
          p.stops[0].place.id !== other.stops[0].place.id
        );
      })
    )
      selected.push(p);
    if (selected.length === 3) break;
  }
  const notices =
    c.transport === "bus" && !transit.trips.length
      ? [
          "No verified bus schedules have been entered. These options use walking.",
        ]
      : [];
  if (c.preferences)
    notices.push(
      "Free-text preferences guide suggestions when AI is available. Only structured constraints are guaranteed.",
    );
  return {
    plans: selected,
    notices,
    ai: false,
    ...(!selected.length
      ? {
          error: `${[...reasons].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Not enough venues match the budget and indoor/outdoor preference. Try allowing either setting."} No two-stop plan fits the ${c.unrestricted?.includes("budget") ? "flexible" : "$" + c.budget} budget, ${c.duration} minutes, ${c.unrestricted?.includes("distance") ? "flexible" : c.maxWalkKm + " km"} walking limit, setting and known opening hours with available routes. Try a supported landmark, add 45 minutes, increase your budget by $15, or loosen the indoor/outdoor preference.`,
        }
      : {}),
  };
}
export async function replaceStop(
  plans: Plan[],
  planId: string,
  index: number,
  criteria: Criteria,
  options: PlannerOptions = {},
): Promise<{ plans: Plan[]; plan: Plan } | { duplicate: true } | null> {
  const at = plans.findIndex((p) => p.id === planId);
  const old = plans[at];
  if (!old?.stops[index]) return null;
  const taken = new Set(plans.filter((_, i) => i !== at).map((p) => p.id));
  let duplicate = false;
  for (const place of options.places ?? places) {
    if (
      old.stops.some((s) => s.place.id === place.id) ||
      (criteria.setting !== "any" && place.indoorOutdoor !== criteria.setting)
    )
      continue;
    const plan = await schedule(
      criteria,
      old.stops.map((s, i) => (i === index ? place : s.place)),
      { ...options, weather: options.weather ?? old.weather },
    );
    if (!plan) continue;
    if (taken.has(plan.id)) {
      duplicate = true;
      continue;
    }
    const next = plans.slice();
    next[at] = plan;
    return { plans: next, plan };
  }
  return duplicate ? { duplicate: true } : null;
}
