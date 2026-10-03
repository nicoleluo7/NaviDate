import { describe, it, expect } from "vitest";
import {
  resolveRequirements,
  naviSession,
} from "../src/lib/voice/requirements";
import { locationFromPosition, locationError } from "../src/lib/location";
import { criteriaSchema } from "../src/types";
const c = criteriaSchema.parse({
  start: { lat: 42.44, lng: -76.49, name: "My location", private: true },
  date: "2026-10-03",
  time: "13:00",
  duration: 180,
  budget: 50,
  vibe: "Cozy",
  transport: "walk",
});
describe("Navi handoff and location", () => {
  it("requires essential details before handing off to Gemini", () => {
    expect(() =>
      resolveRequirements({ startId: "current", budget: 50 }, c.start),
    ).toThrow();
    const result = resolveRequirements(
      { ...c, start: undefined, startId: "current" },
      c.start,
    );
    expect(result).toEqual(c);
  });
  it("rejects invented locations and DST-ambiguous times", () => {
    expect(() =>
      resolveRequirements({ ...c, startId: "made-up" }, c.start),
    ).toThrow();
    expect(() =>
      resolveRequirements(
        { ...c, startId: "current", date: "2026-11-01", time: "01:30" },
        c.start,
      ),
    ).toThrow();
  });
  it("gives Navi only the validated handoff tool", () => {
    expect(naviSession(c).voice).toBe("ara");
    expect(naviSession(c).tools.map((t) => t.name)).toEqual([
      "submit_requirements",
    ]);
  });
  it("uses device coordinates and marks GPS start private", () => {
    const result = locationFromPosition({
      coords: {
        latitude: 42.44,
        longitude: -76.49,
        accuracy: 20,
      } as GeolocationCoordinates,
    });
    expect(result).toMatchObject({ lat: 42.44, lng: -76.49, private: true });
  });
  it("rejects out-of-area and imprecise coordinates with useful errors", () => {
    expect(() =>
      locationFromPosition({
        coords: {
          latitude: 40,
          longitude: -74,
          accuracy: 20,
        } as GeolocationCoordinates,
      }),
    ).toThrow("outside");
    expect(() =>
      locationFromPosition({
        coords: {
          latitude: 42.44,
          longitude: -76.49,
          accuracy: 3000,
        } as GeolocationCoordinates,
      }),
    ).toThrow("approximate");
    expect(locationError(1)).toContain("permission");
    expect(locationError(3)).toContain("too long");
  });
});
