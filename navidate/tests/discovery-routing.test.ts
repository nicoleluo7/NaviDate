import { describe, it, expect, vi, afterEach } from "vitest";
import {
  toDiscoveredPlace,
  googleHours,
  discoverPlaces,
} from "../src/lib/maps/discovery";
import { createGoogleRouter, computeRoute } from "../src/lib/maps/routes";
import { fitsHours } from "../src/lib/planner/hours";
import { localTime } from "../src/lib/planner/time";
import { criteriaSchema } from "../src/types";
import { decodePolyline } from "../src/lib/maps/polyline";
const raw = {
  id: "fixture-place",
  displayName: { text: "Fictional cafe" },
  location: { latitude: 42.44, longitude: -76.49 },
  types: ["cafe"],
  businessStatus: "OPERATIONAL",
};
const c = criteriaSchema.parse({
  start: { lat: 42.44, lng: -76.49, name: "Fixture" },
  date: "2026-10-03",
  time: "13:00",
  duration: 180,
  budget: 50,
  vibe: "Cozy",
  transport: "walk",
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function live() {
  vi.stubEnv("DISABLE_EXTERNAL_APIS", "false");
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "fictional-test-key");
}
describe("Places discovery and route truth", () => {
  it("uses provider coordinates and excludes closed or out-of-area places", () => {
    expect(toDiscoveredPlace(raw)?.category).toBe("café");
    expect(
      toDiscoveredPlace({ ...raw, businessStatus: "CLOSED_PERMANENTLY" }),
    ).toBeNull();
    expect(
      toDiscoveredPlace({ ...raw, location: { latitude: 40, longitude: -74 } }),
    ).toBeNull();
  });
  it("keeps a restaurant with secondary cafe tags in the Food category", () => {
    expect(
      toDiscoveredPlace({
        ...raw,
        primaryType: "italian_restaurant",
        types: ["cafe", "restaurant"],
      })?.category,
    ).toBe("food");
    expect(
      toDiscoveredPlace({
        ...raw,
        primaryType: "cafe",
        types: ["cafe", "restaurant"],
      })?.category,
    ).toBe("café");
  });
  it("maps Sunday and overnight opening hours correctly", () => {
    const p = toDiscoveredPlace({
      ...raw,
      regularOpeningHours: {
        periods: [{ open: { day: 6, hour: 20 }, close: { day: 0, hour: 2 } }],
      },
    })!;
    expect(
      fitsHours(
        p,
        localTime("2026-10-03", "23:30"),
        localTime("2026-10-04", "01:00"),
      ),
    ).toBe(true);
    expect(
      fitsHours(
        p,
        localTime("2026-10-04", "01:30"),
        localTime("2026-10-04", "02:30"),
      ),
    ).toBe(false);
    expect(googleHours(undefined)).toBeNull();
  });
  it("accepts the provider's 24/7 convention", () => {
    const p = toDiscoveredPlace({
      ...raw,
      regularOpeningHours: { periods: [{ open: { day: 0, hour: 0 } }] },
    })!;
    expect(
      fitsHours(
        p,
        localTime("2026-10-03", "23:30"),
        localTime("2026-10-04", "02:30"),
      ),
    ).toBe(true);
  });
  it("discovers live candidates using bounded Nearby Search and valid field masks", async () => {
    live();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ places: [raw, raw] }),
    );
    vi.stubGlobal("fetch", fetch);
    const results = await discoverPlaces(c);
    expect(results).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      JSON.parse(String(fetch.mock.calls[0][1]?.body)).includedTypes,
    ).toEqual(["restaurant"]);
    for (const [, init] of fetch.mock.calls) {
      const body = JSON.parse(String(init?.body));
      expect(body.maxResultCount).toBe(20);
      expect(
        (init?.headers as Record<string, string>)["X-Goog-FieldMask"],
      ).toContain("places.regularOpeningHours");
      expect(body.locationRestriction.circle.radius).toBeLessThanOrEqual(5000);
    }
  });
  it("does not interpret missing route values as a one-minute trip", async () => {
    live();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ routes: [{}] })),
    );
    await expect(
      computeRoute(c.start, { lat: 42.441, lng: -76.49 }, "WALK"),
    ).rejects.toThrow();
  });
  it("requests walking only and does not convert transit into a free walk", async () => {
    live();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ routes: [] }),
    );
    vi.stubGlobal("fetch", fetch);
    const router = createGoogleRouter();
    expect(
      await router.route(c.start, { lat: 42.441, lng: -76.49 }),
    ).toBeNull();
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).travelMode).toBe(
      "WALK",
    );
  });
  it("rejects truncated route geometry", () => {
    expect(() => decodePolyline("_p~iF~")).toThrow();
  });
});
