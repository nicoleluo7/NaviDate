import { afterEach, describe, it, expect, vi } from "vitest";
import { criteriaSchema, placeSchema } from "../src/types";
import raw from "./fixtures/places.json";
import {
  parseRecommendations,
  recommend,
} from "../src/lib/planner/recommendations";
import { planWithGemini, coherent } from "../src/lib/planner/gemini";
import { generate } from "../src/lib/planner/service";
vi.mock("../src/lib/planner/recommendations", async (original) => ({
  ...(await original<typeof import("../src/lib/planner/recommendations")>()),
  recommend: vi.fn(),
}));
const places = raw.map((p) => placeSchema.parse(p));
const c = criteriaSchema.parse({
  start: { ...places[0].coordinates, name: "Fixture" },
  date: "2026-10-03",
  time: "13:00",
  duration: 120,
  budget: 40,
  vibe: "Cozy",
  transport: "walk",
});
const draft = {
  title: "Fixture date",
  explanation: "A fictional pair of activities",
  stops: places
    .slice(0, 2)
    .map((p) => ({ placeId: p.id, minutes: 30, activity: "Fixture activity" })),
};
const router = {
  route: vi.fn(async () => ({ minutes: 10, km: 0.3, label: "Fixture walk" })),
};
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("Gemini recommendation pipeline", () => {
  it("rejects cafe-only Food plans and requires the chosen restaurant", async () => {
    const catalog = places.map((p, i) => ({
      ...p,
      category:
        i === 0 ? ("café" as const) : i === 1 ? ("food" as const) : p.category,
    }));
    expect(coherent([catalog[0], catalog[2]], { ...c, dateType: "food" })).toBe(
      false,
    );
    expect(
      coherent([catalog[0], catalog[1]], {
        ...c,
        dateType: "food",
        restaurantId: catalog[2].id,
      }),
    ).toBe(false);
    vi.mocked(recommend).mockResolvedValue([draft]);
    const result = await planWithGemini(
      { ...c, dateType: "food", restaurantId: catalog[1].id },
      { places: catalog, router },
    );
    expect(result.plans).toHaveLength(1);
    expect(
      result.plans[0].stops.some((s) => s.place.id === catalog[1].id),
    ).toBe(true);
  });
  it("drops invented and duplicate place IDs and keeps the valid plans", () => {
    const invented = {
      ...draft,
      title: "Invented",
      stops: [{ ...draft.stops[0], placeId: "invented" }, draft.stops[1]],
    };
    const repeated = {
      ...draft,
      stops: [draft.stops[0], draft.stops[0]],
    };
    expect(parseRecommendations({ plans: [invented] }, places)).toEqual([]);
    expect(parseRecommendations({ plans: [repeated] }, places)).toEqual([]);
    expect(
      parseRecommendations({ plans: [invented, draft] }, places),
    ).toEqual([draft]);
    expect(
      parseRecommendations(
        {
          plans: [
            {
              ...draft,
              stops: [
                { ...draft.stops[0], placeId: places[0].name },
                draft.stops[1],
              ],
            },
          ],
        },
        places,
      )[0].stops[0].placeId,
    ).toBe(places[0].id);
  });
  it("does not trust model budget or timing and includes every travel leg", async () => {
    vi.mocked(recommend).mockResolvedValue([draft]);
    const result = await planWithGemini(c, { places, router });
    expect(result.ai).toBe(true);
    expect(result.plans[0].cost).toBe(22);
    expect(result.plans[0].duration).toBe(80);
    expect(result.plans[0].legs).toHaveLength(2);
  });
  it("asks for a dessert stop without telling the user to add a restaurant", async () => {
    const dessert = {
      ...places[0],
      id: "sweet-stop",
      category: "dessert" as const,
    };
    vi.mocked(recommend).mockResolvedValue([draft]);
    const result = await planWithGemini(
      { ...c, dateType: "dessert" },
      { places: [...places, dessert], router },
    );
    expect(result.plans).toHaveLength(0);
    expect(result.error).toMatch(/dessert/i);
    expect(result.error).not.toContain("For Food");
    const repair = vi.mocked(recommend).mock.calls[1]?.[4];
    expect(JSON.stringify(repair)).toContain("category is dessert");
    expect(JSON.stringify(repair)).not.toContain("For Food");
  });
  it("shortens long visits so travel still fits a two-hour date", async () => {
    vi.mocked(recommend).mockResolvedValue([
      {
        ...draft,
        stops: draft.stops.map((stop) => ({ ...stop, minutes: 90 })),
      },
    ]);
    const result = await planWithGemini(c, { places, router });
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].duration).toBeLessThanOrEqual(120);
    expect(result.plans[0].stops).toHaveLength(2);
  });
  it("plans one restaurant when an hour cannot hold a meal and another stop", async () => {
    const catalog = places.map((place, index) =>
      index === 1 ? { ...place, category: "food" as const } : place,
    );
    vi.mocked(recommend).mockResolvedValue([
      {
        ...draft,
        stops: draft.stops.map((stop) => ({ ...stop, minutes: 60 })),
      },
    ]);
    const result = await planWithGemini(
      { ...c, duration: 60, dateType: "food" },
      { places: catalog, router },
    );
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].stops.map((stop) => stop.place.id)).toEqual([
      "fictional-b",
    ]);
    expect(result.plans[0].duration).toBeLessThanOrEqual(60);
    expect(result.error).toBeUndefined();
  });
  it("rejects over-budget plans instead of shortening them", async () => {
    vi.mocked(recommend).mockResolvedValue([draft]);
    const result = await planWithGemini(
      { ...c, budget: 15 },
      { places, router },
    );
    expect(result.plans).toHaveLength(0);
    expect(recommend).toHaveBeenCalledTimes(2);
  });
  it("uses feedback for a bounded repair when hours reject the first candidate", async () => {
    const late = { ...c, time: "16:00" };
    vi.mocked(recommend)
      .mockResolvedValueOnce([
        { ...draft, stops: draft.stops.map((s) => ({ ...s, minutes: 60 })) },
      ])
      .mockResolvedValueOnce([
        { ...draft, stops: draft.stops.map((s) => ({ ...s, minutes: 20 })) },
      ]);
    const result = await planWithGemini(late, { places, router });
    expect(result.plans).toHaveLength(1);
    expect(recommend).toHaveBeenCalledTimes(2);
  });
  it("never silently drops a closed third stop", async () => {
    vi.mocked(recommend).mockResolvedValue([
      {
        ...draft,
        stops: places.map((p) => ({
          placeId: p.id,
          minutes: 30,
          activity: "Fixture",
        })),
      },
    ]);
    const result = await planWithGemini(
      { ...c, time: "16:00", duration: 180 },
      { places, router },
    );
    expect(result.plans).toHaveLength(0);
  });
  it("filters indoor preferences and rejects two full meals", () => {
    expect(
      coherent(
        places.slice(0, 2).map((p) => ({ ...p, category: "food" })),
        c,
      ),
    ).toBe(false);
  });
  it("does not force duplicate date options", async () => {
    vi.mocked(recommend).mockResolvedValue([
      draft,
      { ...draft, title: "Same places", stops: [...draft.stops].reverse() },
    ]);
    expect((await planWithGemini(c, { places, router })).plans).toHaveLength(1);
  });
  it("keeps structured planning functional with external APIs disabled", async () => {
    const result = await generate(c, { places, router });
    expect(result.ai).toBe(false);
    expect(recommend).not.toHaveBeenCalled();
    expect(result.notices.join(" ")).toContain("Local suggestions");
  });
});
