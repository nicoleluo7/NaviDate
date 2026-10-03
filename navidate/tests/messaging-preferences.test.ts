import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { handleIncoming, type Conversation } from "../src/lib/messaging";
import {
  naturalCriteria,
  flexibleCriteria,
  sharedCoordinates,
  nextQuestion,
} from "../src/lib/messaging/preferences";
import { LocalStorage } from "../src/lib/storage";
import { hash, publicPlan } from "../src/lib/storage/dates";
import { generate } from "../src/lib/planner/service";
import { criteriaSchema } from "../src/types";
import { schedule } from "../src/lib/planner";
import { placeSchema } from "../src/types";
import raw from "./fixtures/places.json";
vi.mock("../src/lib/planner/service", () => ({ generate: vi.fn() }));
const event = {
  id: "one",
  spaceId: "room",
  senderId: "person",
  platform: "local" as const,
  text: "hello",
  own: false,
  direct: true,
};
const c = criteriaSchema.parse({
  start: { lat: 42.45, lng: -76.48, name: "Fixture" },
  date: "2026-10-04",
  time: "14:00",
  duration: 180,
  budget: 50,
  vibe: "Cozy",
  transport: "walk",
});
let store: LocalStorage;
const send = vi.fn<(text: string) => Promise<string>>(async () => "sent");
const key = "conversation:" + hash("local:room:person");
beforeEach(() => {
  store = new LocalStorage(":memory:");
  vi.mocked(generate).mockResolvedValue({
    plans: [],
    notices: [],
    ai: false,
    error: "Try another time.",
  });
  send.mockClear();
});
afterEach(() => {
  store.close();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
it("asks one friendly essential question instead of a criteria checklist", async () => {
  await handleIncoming(event, { send }, store);
  expect(send.mock.calls[0][0]).toContain("Where would you like to start");
  expect(send.mock.calls[0][0]).not.toContain("budget");
  await handleIncoming(
    { ...event, id: "two", text: "Ithaca Commons" },
    { send },
    store,
  );
  expect(send.mock.calls[1][0]).toContain("What day");
  await handleIncoming(
    { ...event, id: "three", text: "tomorrow at 7pm" },
    { send },
    store,
  );
  const criteria = vi.mocked(generate).mock.calls[0][0] as typeof c;
  expect(criteria.time).toBe("19:00");
  expect(criteria.dateType).toBe("any");
  expect(criteria.unrestricted).toEqual(
    expect.arrayContaining(["budget", "distance", "vibe"]),
  );
  expect(criteria.duration).toBe(180);
});
it("keeps explicit limits and dietary preferences while leaving omitted ones open", () => {
  const result = criteriaSchema.parse(
    flexibleCriteria(
      naturalCriteria("tomorrow at 6pm, coffee under $40, 2 hours", {
        start: c.start,
        dietary: ["vegan"],
      }),
    ),
  );
  expect(result).toMatchObject({
    time: "18:00",
    budget: 40,
    duration: 120,
    dateType: "coffee",
    dietary: ["vegan"],
  });
  expect(result.unrestricted).not.toContain("budget");
  expect(result.unrestricted).toContain("distance");
});
it("allows no-preference revisions and later reinstates an explicit budget", () => {
  const open = naturalCriteria("any budget and any distance", c);
  expect(flexibleCriteria(open).unrestricted).toEqual(
    expect.arrayContaining(["budget", "distance"]),
  );
  const limited = naturalCriteria("under $35", open);
  expect(limited.budget).toBe(35);
  expect(limited.unrestricted).not.toContain("budget");
});
it("resolves relative dates in New York and lets users choose any time", () => {
  const now = Temporal.ZonedDateTime.from(
    "2026-10-03T23:15-04:00[America/New_York]",
  );
  expect(naturalCriteria("tomorrow 1pm", {}, now).date).toBe("2026-10-04");
  const any = naturalCriteria("anywhere, any time", {}, now);
  expect(any.date).toBe("2026-10-04");
  expect(any.time).toBe("00:00");
  expect(any.start?.name).toContain("Commons");
});
it("offers user-initiated location sharing without generating or claiming to see GPS", async () => {
  await handleIncoming(
    { ...event, text: "can you use my current location?" },
    { send },
    store,
  );
  expect(send.mock.calls[0][0]).toContain("/location");
  expect(send.mock.calls[0][0]).toContain("until you choose");
  expect(generate).not.toHaveBeenCalled();
});
it("accepts coordinates and Apple map pins as private Google route origins", async () => {
  const start = sharedCoordinates(
    "https://maps.apple.com/?q=Current+Location&ll=42.439600,-76.496600",
  );
  expect(start).toMatchObject({ lat: 42.4396, lng: -76.4966, private: true });
  await store.put(key, { criteria: c, revision: 0 } satisfies Conversation);
  await handleIncoming(
    { ...event, text: "Start from my location: 42.439600, -76.496600" },
    { send },
    store,
  );
  const request = vi.mocked(generate).mock.calls[0][0] as typeof c;
  expect(request.start).toEqual(start);
  const places = raw.slice(0, 2).map((p) => placeSchema.parse(p));
  const plan = await schedule(request, places, {
    router: {
      route: async () => ({ minutes: 5, km: 0.2, label: "Fixture walk" }),
    },
  });
  expect(plan).not.toBeNull();
  expect(new URL(plan!.googleMapsUrl!).searchParams.get("origin")).toBe(
    "42.4396,-76.4966",
  );
  expect(JSON.stringify(publicPlan(plan!))).not.toContain("42.4396");
});
it("rejects out-of-area coordinates without replacing the previous start", async () => {
  await store.put(key, { criteria: c, revision: 0 });
  await handleIncoming(
    { ...event, text: "My location: 40.7000,-74.0000" },
    { send },
    store,
  );
  expect(send.mock.calls[0][0]).toContain("outside the Ithaca area");
  expect((await store.get<Conversation>(key))?.criteria.start).toEqual(c.start);
});
it("flexible limits are not silently treated as dollar or walking caps", async () => {
  const places = raw.slice(0, 2).map((p) => placeSchema.parse(p));
  const router = {
    route: async () => ({ minutes: 5, km: 1, label: "Fixture walk" }),
  };
  expect(
    await schedule({ ...c, budget: 0, maxWalkKm: 0.1 }, places, { router }),
  ).toBeNull();
  expect(
    await schedule(
      { ...c, budget: 0, maxWalkKm: 0.1, unrestricted: ["budget", "distance"] },
      places,
      { router },
    ),
  ).not.toBeNull();
});
it("only essential questions remain after optional defaults", () => {
  expect(
    nextQuestion(flexibleCriteria({ start: c.start, date: c.date })),
  ).toContain("what time");
  expect(
    nextQuestion(
      flexibleCriteria({ start: c.start, date: c.date, time: c.time }),
    ),
  ).toBeUndefined();
});
it("rebuilds a stale Google route from stops when directions are requested", async () => {
  const places = raw.slice(0, 2).map((p, i) => ({
    ...placeSchema.parse(p),
    googlePlaceId: `fixture-place-${i}`,
  }));
  const plan = await schedule(c, places, {
    router: {
      route: async () => ({ minutes: 5, km: 0.2, label: "Fixture walk" }),
    },
  });
  plan!.googleMapsUrl =
    "https://www.google.com/maps/dir/?waypoints=place_id%3Abroken";
  await store.put("date:fixture", {
    shareId: "fixture",
    criteria: c,
    plan,
    ownerHash: "fixture",
  });
  await store.put(key, { criteria: c, revision: 0, shareId: "fixture" });
  await handleIncoming(
    { ...event, text: "Send me the Google Maps directions" },
    { send },
    store,
  );
  const text = send.mock.calls[0][0];
  expect(decodeURIComponent(text)).not.toContain("place_id:");
  expect(text).not.toContain("waypoint_place_ids");
  expect(text).toContain("waypoints=fictional-a");
});

it("introduces Navi naturally without a saved date or an AI call", async () => {
  await handleIncoming({ ...event, text: "What is ur name?" }, { send }, store);
  expect(send.mock.calls[0][0]).toContain("I’m Navi");
  expect(generate).not.toHaveBeenCalled();
});
