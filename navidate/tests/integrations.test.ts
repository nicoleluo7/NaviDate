import { afterEach, it, expect, vi } from "vitest";
import { getWeather } from "../src/lib/integrations/weather";
import { criteriaSchema } from "../src/types";
import { dateAt } from "../src/lib/planner/time";
import { generate } from "../src/lib/planner/service";
vi.mock("../src/lib/integrations/xai", () => ({
  suggest: vi.fn(async () => {
    throw new Error("timeout");
  }),
}));
const c = () =>
  criteriaSchema.parse({
    start: {
      id: "johnson",
      name: "Johnson Museum",
      lat: 42.4505,
      lng: -76.4862,
    },
    date: dateAt(Date.now()),
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
it("continues when weather fails or returns malformed data", async () => {
  vi.stubEnv("DISABLE_EXTERNAL_APIS", "false");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
  expect((await getWeather(c())).summary).toBe("Forecast unavailable");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ daily: { wrong: true } }))),
  );
  expect((await getWeather(c())).available).toBe(false);
});
it("does not invent or fetch forecasts outside coverage", async () => {
  vi.stubEnv("DISABLE_EXTERNAL_APIS", "false");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect((await getWeather({ ...c(), date: "2099-01-01" })).available).toBe(
    false,
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("uses local plans when AI times out", async () => {
  vi.stubEnv("DISABLE_EXTERNAL_APIS", "false");
  vi.stubEnv("XAI_API_KEY", "fictional-test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
  const r = await generate({ ...c(), date: "2026-10-02" });
  expect(r.ai).toBe(false);
  expect(r.plans.length).toBeGreaterThan(0);
  expect(r.notices.join(" ")).toContain("AI suggestions are unavailable");
});
