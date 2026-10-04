import { it, expect, vi, afterEach } from "vitest";
import {
  parseGroundedReply,
  researchVenueWithGemini,
} from "../src/lib/integrations/gemini";
import {
  referencedVenue,
  isVenueQuestion,
  venueFallback,
  conversationalIntro,
} from "../src/lib/messaging/questions";
import type { Plan } from "../src/types";
vi.mock("../src/lib/integrations/quota", () => ({ claimDaily: vi.fn() }));
const plan = {
  title: "Fixture date",
  startsAt: "2026-10-04T17:00:00Z",
  duration: 165,
  cost: 30,
  weather: { summary: "64–64°F with up to 2% precipitation." },
  stops: [
    { place: { name: "Fictional Park", category: "park" } },
    {
      place: {
        name: "Fictional Bagels",
        address: "Fixture address",
        category: "café",
        websiteUrl: "https://example.com/menu",
      },
    },
  ],
} as Plan;
const history = [
  {
    role: "assistant" as const,
    text: "After that, you’re at Fictional Bagels.",
  },
];
const grounded = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: "Their listed bagel sandwich could be a nice savory choice.",
          },
        ],
      },
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://example.com/menu", title: "Official menu" } },
        ],
        groundingSupports: [{ groundingChunkIndices: [0] }],
      },
    },
  ],
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("resolves there from the previous stop mentioned rather than refusing", () => {
  expect(isVenueQuestion("What do you recommend there?")).toBe(true);
  expect(
    referencedVenue(plan, "What do you recommend there?", history)?.name,
  ).toBe("Fictional Bagels");
  expect(venueFallback(plan, "What should I order?", history)).toContain(
    "sweet or savory",
  );
  expect(venueFallback(plan, "What should I order?", [])).toContain(
    "Which stop",
  );
});
it("opens with a named walking route and no itinerary link", () => {
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("PUBLIC_APP_URL", "https://navidate.us/");
  const text = conversationalIntro({
    ...plan,
    start: { name: "Beebe Lake", lat: 42.45, lng: -76.48, private: false },
    stops: [
      {
        place: {
          name: "Libe Slope",
          address: "Libe Slope",
          coordinates: { lat: 42.447, lng: -76.484 },
        },
      },
      {
        place: {
          name: "place_id:ChIJabcdefghijklmnopqrstuvwxyz",
          address: "123 Dryden Rd",
          coordinates: { lat: 42.44, lng: -76.48 },
        },
      },
    ],
  } as Plan);
  const maps =
    text.match(/https:\/\/www\.google\.com\/maps\/dir\/\?\S+/)?.[0] ?? "";
  expect(text).not.toContain("/date/");
  expect(maps).toContain("https://www.google.com/maps/dir/?");
  const decoded = decodeURIComponent(maps.replace(/\+/g, " "));
  expect(decoded).toContain("Libe Slope");
  expect(decoded).toContain("123 Dryden Rd");
  expect(decoded).not.toContain("place_id:");
  expect(text).toContain("\n\n");
  expect(text).not.toContain("localhost");
  expect(text).not.toContain("64–64");
});
it("requires cited provider sources instead of presenting ungrounded output as researched", () => {
  expect(parseGroundedReply(grounded)).toContain("https://example.com/menu");
  expect(() =>
    parseGroundedReply({
      candidates: [{ content: { parts: [{ text: "Invented menu" }] } }],
    }),
  ).toThrow("No verified");
});
it("uses the documented Google Search tool for venue research and omits private plan coordinates", async () => {
  vi.stubEnv("DISABLE_EXTERNAL_APIS", "false");
  vi.stubEnv("GEMINI_API_KEY", "fixture");
  const fetch = vi.fn(async () => Response.json(grounded));
  vi.stubGlobal("fetch", fetch);
  const answer = await researchVenueWithGemini(
    {
      ...plan,
      start: { name: "Home", lat: 42.412345, lng: -76.512345, private: true },
    },
    "What do you recommend there?",
    history,
  );
  expect(answer).toContain("Sources:");
  const sent = JSON.parse(
    String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body),
  );
  expect(sent.tools).toEqual([{ google_search: {} }]);
  expect(JSON.stringify(sent)).not.toContain("42.412345");
  expect(sent.contents[0].parts[0].text).toContain("Fictional Bagels");
});
