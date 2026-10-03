import { afterEach, describe, expect, it, vi } from "vitest";
import { getWeather, weatherForWindow } from "../src/lib/integrations/weather";
import {
  criteriaSchema,
  placeSchema,
  type Weather,
  type WeatherHour,
} from "../src/types";
import { localTime, dateAt, iso } from "../src/lib/planner/time";
import { planDates, schedule } from "../src/lib/planner";
import raw from "./fixtures/places.json";
const criteria = criteriaSchema.parse({
  start: { id: "fictional-a", name: "Fixture", lat: 42.4505, lng: -76.4862 },
  date: "2026-10-03",
  time: "13:00",
  duration: 180,
  budget: 50,
  vibe: "Cozy",
  transport: "walk",
});
const hour = (
  time: number,
  overrides: Partial<WeatherHour> = {},
): WeatherHour => ({
  time: iso(time),
  temperature: 18,
  rain: 10,
  precipitation: 0,
  snow: 0,
  wind: 8,
  code: 1,
  ...overrides,
});
const forecast = (hours: WeatherHour[]): Weather => ({
  available: true,
  summary: "Fixture forecast",
  source: "Fictional weather fixture",
  hours,
});
const router = {
  route: async () => ({ minutes: 5, km: 0.2, label: "Fixture walk" }),
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("hourly weather windows", () => {
  it("ignores rain outside the date and uses only overlapping hours", () => {
    const start = localTime(criteria.date, "13:00");
    const w = forecast([
      hour(start - 3600000, { rain: 100 }),
      hour(start),
      hour(start + 3600000),
      hour(start + 7200000, { rain: 100 }),
    ]);
    const result = weatherForWindow(w, start + 900000, start + 7200000);
    expect(result.rain).toBe(10);
    expect(result.wet).toBe(false);
    expect(result.hours).toHaveLength(2);
  });
  it("includes next-day rain when a date crosses midnight", () => {
    const start = localTime(criteria.date, "23:00");
    const result = weatherForWindow(
      forecast([hour(start), hour(start + 3600000, { rain: 90 })]),
      start + 1800000,
      start + 7200000,
    );
    expect(result.wet).toBe(true);
    expect(dateAt(Date.parse(result.endsAt!))).toBe("2026-10-04");
  });
  it("handles a DST transition by elapsed UTC hours", () => {
    const start = localTime("2026-11-01", "00:00");
    const result = weatherForWindow(
      forecast(Array.from({ length: 4 }, (_, i) => hour(start + i * 3600000))),
      start,
      start + 4 * 3600000,
    );
    expect(result.available).toBe(true);
    expect(result.hours).toHaveLength(4);
  });
  it("does not claim a forecast for missing hours or partial coverage", () => {
    const start = localTime(criteria.date, "13:00");
    expect(
      weatherForWindow(
        forecast([hour(start), hour(start + 7200000)]),
        start,
        start + 10800000,
      ).available,
    ).toBe(false);
    expect(
      weatherForWindow(forecast([hour(start)]), start, start + 7200000)
        .available,
    ).toBe(false);
  });
  it("fetches and validates hourly data using Unix timestamps and interval precipitation", async () => {
    vi.stubEnv("DISABLE_EXTERNAL_APIS", "false");
    const c = { ...criteria, date: dateAt(Date.now()), duration: 60 };
    const start = localTime(c.date, c.time);
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        hourly: {
          time: [start / 1000, start / 1000 + 3600],
          temperature_2m: [18, 19],
          precipitation_probability: [0, 80],
          precipitation: [0, 2],
          snowfall: [0, 0],
          wind_speed_10m: [10, 12],
          weather_code: [61, 61],
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await getWeather(c);
    expect(result.available).toBe(true);
    expect(result.rain).toBe(80);
    expect(result.wet).toBe(true);
    const url = String(fetch.mock.calls[0]?.[0]);
    expect(url).toContain("timeformat=unixtime");
    expect(url).toContain("timezone=America%2FNew_York");
  });
});
describe("weather-aware planning", () => {
  const places = raw.map((p) => placeSchema.parse(p));
  const outdoor = {
    ...places[2],
    indoorOutdoor: "outdoor" as const,
    vibeTags: ["Cozy" as const],
  };
  const start = localTime(criteria.date, criteria.time);
  const wet = forecast(
    Array.from({ length: 4 }, (_, i) =>
      hour(start + i * 3600000, { rain: 90 }),
    ),
  );
  it("ranks an indoor alternative first during rain", async () => {
    const result = await planDates(criteria, {
      places: [places[0], places[1], outdoor],
      router,
      weather: wet,
    });
    expect(result.plans.length).toBeGreaterThan(0);
    expect(
      result.plans[0].stops.every((s) => s.place.indoorOutdoor === "indoor"),
    ).toBe(true);
    expect(result.plans[0].weather.advice).toContain("Indoor stops");
  });
  it("excludes an outdoor stop during thunderstorms", async () => {
    const weather = forecast(wet.hours!.map((h) => ({ ...h, code: 95 })));
    expect(
      await schedule(criteria, [places[0], outdoor], { router, weather }),
    ).toBeNull();
    expect(
      await schedule(criteria, places.slice(0, 2), { router, weather }),
    ).not.toBeNull();
  });
  it("keeps planning without a forecast", async () => {
    const plan = await schedule(criteria, [places[0], outdoor], { router });
    expect(plan).not.toBeNull();
    expect(plan?.weather.available).toBe(false);
  });
});
