import { describe, it, expect } from "vitest";
import { z } from "zod";
import raw from "./fixtures/places.json";
import bus from "./fixtures/transit.json";
import { criteriaSchema, placeSchema, type Criteria } from "../src/types";
import { schedule, planDates, replaceStop } from "../src/lib/planner";
import { fitsHours } from "../src/lib/planner/hours";
import { localTime, serviceTime } from "../src/lib/planner/time";
import { directTrips, runsOn } from "../src/lib/transit";
import { localWalk } from "../src/lib/routing";
import { parseSuggestions } from "../src/lib/integrations/xai";
import { validateTransit } from "../scripts/validate-data";
const places = z.array(placeSchema).parse(raw);
const criteria: Criteria = criteriaSchema.parse({
  start: { id: "a", name: "Fictional start", lat: 42.44, lng: -76.49 },
  date: "2026-10-02",
  time: "13:00",
  duration: 180,
  budget: 30,
  vibe: "Cozy",
  transport: "walk",
});
const router = {
  route: async () => ({ minutes: 10, km: 0.5, label: "Fictional test walk" }),
};
describe("deterministic scheduling", () => {
  it("keeps a driving plan that is farther than the walking limit", async () => {
    const driveRouter = {
      route: async () => ({
        minutes: 8,
        km: 8,
        label: "Google Maps · estimated driving time",
      }),
    };
    expect(
      await schedule(criteria, places.slice(0, 2), { router: driveRouter }),
    ).toBeNull();
    const driven = await schedule(
      { ...criteria, transport: "drive" },
      places.slice(0, 2),
      { router: driveRouter },
    );
    expect(driven?.legs.every((leg) => leg.mode === "drive")).toBe(true);
    expect(driven?.googleMapsUrl).toContain("travelmode=driving");
  });
  it("counts costs for two and never exceeds budget", async () => {
    const p = await schedule(criteria, places.slice(0, 2), { router });
    expect(p?.cost).toBe(22);
    expect(
      await schedule({ ...criteria, budget: 21 }, places.slice(0, 2), {
        router,
      }),
    ).toBeNull();
  });
  it("counts all travel and activities, including the return", async () => {
    const p = await schedule(
      { ...criteria, returnToStart: true },
      places.slice(0, 2),
      { router },
    );
    expect(p?.duration).toBe(90);
    expect(
      await schedule({ ...criteria, duration: 79 }, places.slice(0, 2), {
        router,
      }),
    ).toBeNull();
  });
  it("checks activity completion, not only arrival before closing", () => {
    expect(
      fitsHours(
        places[0],
        localTime("2026-10-02", "16:45"),
        localTime("2026-10-02", "17:15"),
      ),
    ).toBe(false);
  });
  it("fits overnight hours from the preceding day", () => {
    const p = {
      ...places[0],
      openingHours: {
        weekly: { "5": [["22:00", "02:00"] as [string, string]] },
        exceptions: {},
      },
    };
    expect(
      fitsHours(
        p,
        localTime("2026-10-03", "00:30"),
        localTime("2026-10-03", "01:00"),
      ),
    ).toBe(true);
  });
  it("rejects DST gaps and folds explicitly", () => {
    expect(() => localTime("2026-03-08", "02:30")).toThrow();
    expect(() => localTime("2026-11-01", "01:30")).toThrow();
  });
  it("passes midnight using real elapsed minutes", async () => {
    const p = await schedule(
      { ...criteria, time: "23:30" },
      places.slice(0, 2).map((p) => ({ ...p, openingHours: null })),
      { router },
    );
    expect(p?.endsAt).toBe("2026-10-03T04:50:00.000Z");
  });
  it("rejects unavailable routes and excessive walking", async () => {
    expect(
      await schedule(criteria, places.slice(0, 2), {
        router: { route: async () => null },
      }),
    ).toBeNull();
    expect(
      await schedule({ ...criteria, maxWalkKm: 0.9 }, places.slice(0, 2), {
        router,
      }),
    ).toBeNull();
  });
  it("does not connect arbitrary points to an unverified path", () => {
    expect(
      localWalk({ lat: 42.42, lng: -76.51 }, { lat: 42.4505, lng: -76.4862 }),
    ).toBeNull();
  });
  it("offers fewer options rather than duplicate venue sets", async () => {
    const result = await planDates(criteria, {
      places: places.slice(0, 2),
      router,
    });
    expect(result.plans).toHaveLength(1);
  });
  it("skips a swap that would copy another option", async () => {
    const current = await schedule(criteria, places.slice(0, 2), { router });
    const other = await schedule(criteria, [places[0], places[2]], { router });
    const extra = {
      ...places[2],
      id: "fictional-d",
      name: "fictional-d",
      estimatedCostForTwo: 1,
    };
    const replaced = await replaceStop(
      [current!, other!],
      current!.id,
      1,
      criteria,
      { router, places: [places[2], extra] },
    );
    if (!replaced || !("plan" in replaced))
      throw new Error("Expected a replacement plan");
    expect(replaced.plan.stops.map((s) => s.place.id)).toEqual([
      "fictional-a",
      "fictional-d",
    ]);
    expect(replaced?.plans.map((p) => p.id)).toEqual([
      replaced?.plan.id,
      other!.id,
    ]);
    expect(
      await replaceStop([current!, other!], current!.id, 1, criteria, {
        router,
        places: [places[2]],
      }),
    ).toEqual({ duplicate: true });
  });
});
describe("manual bus matching", () => {
  const walk = (a: { id?: string }, b: { id?: string }) =>
    a.id === b.id ? { minutes: 0, km: 0, label: "fixture" } : null;
  const from = { id: "a", ...bus.stops[0].coordinates },
    to = { id: "c", ...bus.stops[2].coordinates };
  it("checks weekdays and explicit additions/removals", () => {
    expect(runsOn(bus.calendars[0], "2026-10-02")).toBe(true);
    expect(runsOn(bus.calendars[0], "2026-10-04")).toBe(false);
    expect(runsOn(bus.calendars[0], "2026-10-05")).toBe(false);
    expect(runsOn(bus.calendars[0], "2026-10-03")).toBe(true);
  });
  it("includes waiting and the fare for two", () => {
    const t = directTrips(
      bus,
      from,
      to,
      localTime("2026-10-02", "13:00"),
      walk,
      5,
      true,
    )[0];
    expect(t.wait).toBe(10);
    expect((t.end - localTime("2026-10-02", "13:00")) / 60000).toBe(30);
    expect(t.route.fareForTwo).toBe(3);
  });
  it("misses departure when the boarding buffer cannot fit", () => {
    expect(
      directTrips(
        bus,
        from,
        to,
        localTime("2026-10-02", "13:06"),
        walk,
        5,
        true,
      ),
    ).toHaveLength(0);
  });
  it("matches boarding and alighting in the same trip and direction", () => {
    expect(
      directTrips(
        bus,
        to,
        from,
        localTime("2026-10-02", "13:00"),
        walk,
        5,
        true,
      ),
    ).toHaveLength(0);
    const wrong = {
      ...bus,
      trips: bus.trips.map((t) => ({ ...t, direction: "west" })),
    };
    expect(
      directTrips(
        wrong,
        from,
        to,
        localTime("2026-10-02", "13:00"),
        walk,
        5,
        true,
      ),
    ).toHaveLength(0);
  });
  it("interprets 25:10 on the prior service day", () => {
    const t = directTrips(
      bus,
      from,
      to,
      localTime("2026-10-03", "01:00"),
      walk,
      5,
      true,
    )[0];
    expect(t.serviceDate).toBe("2026-10-02");
    expect(t.departure).toBe(serviceTime("2026-10-02", "25:10"));
  });
  it("disables demo trips for real planning", () => {
    expect(
      directTrips(bus, from, to, localTime("2026-10-02", "13:00"), walk),
    ).toHaveLength(0);
  });
  it("validates references and nonmonotonic trip times", () => {
    expect(validateTransit(bus)).toEqual([]);
    const bad = structuredClone(bus);
    bad.trips[0].stopTimes[1].time = "12:00";
    bad.trips[0].routeId = "missing";
    expect(validateTransit(bad)).toContain("demo-day: nonmonotonic stop times");
    expect(validateTransit(bad)).toContain("demo-day: missing route");
  });
});
describe("AI boundaries", () => {
  it("rejects malformed output and unknown venue IDs", () => {
    expect(() =>
      parseSuggestions({ sequences: [["imaginary", "johnson"]] }),
    ).toThrow();
    expect(() => parseSuggestions("not JSON")).toThrow();
    expect(() =>
      parseSuggestions({ sequences: [["johnson", "johnson"]] }),
    ).toThrow();
  });
});
it("includes direct bus fares, waiting and walking in the complete plan budget", async () => {
  const venues = places.slice(0, 2).map((p, i) => ({
    ...p,
    id: i === 0 ? "c" : "destination",
    coordinates: { lat: 42.44, lng: i === 0 ? -0.0 - 76.47 : -76.469 },
  }));
  const c = { ...criteria, budget: 25 };
  const walk = (a: { id?: string }, b: { id?: string }) =>
    a.id === b.id ? { minutes: 0, km: 0, label: "fixture" } : null;
  const p = await schedule({ ...c, transport: "bus" }, venues, {
    router: { route: async () => ({ minutes: 60, km: 3, label: "fixture" }) },
    transit: bus,
    walkLookup: walk,
    allowDemo: true,
  });
  expect(p?.cost).toBe(25);
  expect(p?.legs[0].bus?.wait).toBe(10);
  expect(p?.duration).toBe(150);
  const rejected = await schedule(
    { ...c, transport: "bus", budget: 24, duration: 160 },
    venues,
    {
      router: { route: async () => ({ minutes: 60, km: 3, label: "fixture" }) },
      transit: bus,
      walkLookup: walk,
      allowDemo: true,
    },
  );
  expect(rejected).toBeNull();
});

describe("date types", () => {
  const coffee = { ...places[0], category: "café" as const };
  const food = { ...places[1], category: "food" as const };
  it("requires the requested activity, while allowing a complementary stop", async () => {
    for (const [dateType, category] of [
      ["coffee", "café"],
      ["food", "food"],
    ] as const) {
      const result = await planDates(
        { ...criteria, dateType },
        { places: [coffee, food, places[2]], router },
      );
      expect(result.plans.length).toBeGreaterThan(0);
      expect(
        result.plans.every((p) =>
          p.stops.some((s) => s.place.category === category),
        ),
      ).toBe(true);
    }
  });
  it("explains when the requested activity is unavailable", async () => {
    const result = await planDates(
      { ...criteria, dateType: "coffee" },
      { places, router },
    );
    expect(result.plans).toHaveLength(0);
    expect(result.error).toContain("date type");
  });
  it("cannot swap away the only requested coffee stop", async () => {
    const c = { ...criteria, dateType: "coffee" as const };
    const plan = await schedule(c, [coffee, places[1]], { router });
    expect(
      await replaceStop([plan!], plan!.id, 0, c, {
        router,
        places: [places[2]],
      }),
    ).toBeNull();
  });
  it("keeps old saved criteria compatible", () => {
    const old: Partial<Criteria> = { ...criteria };
    delete old.dateType;
    expect(criteriaSchema.parse(old).dateType).toBe("any");
  });
});
