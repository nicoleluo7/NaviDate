import { describe, it, expect } from "vitest";
import { decodePolyline } from "../src/lib/maps/polyline";
import { buildGoogleMapsRouteUrl } from "../src/lib/maps/googleMapsUrl";
import { parseGeminiDatePlans } from "../src/lib/integrations/gemini";
import { categoryFrom } from "../src/lib/maps/places";

describe("Google Maps helpers", () => {
  it("builds an ordered walking directions URL with place IDs", () => {
    const url = buildGoogleMapsRouteUrl({
      start: { name: "Johnson Museum", lat: 42.4505, lng: -76.4862 },
      stops: [
        {
          name: "Hound and Mare",
          lat: 42.44,
          lng: -76.49,
          googlePlaceId: "ChIJStopOne",
        },
        {
          name: "Gimme Coffee",
          lat: 42.441,
          lng: -76.5,
          googlePlaceId: "ChIJStopTwo",
        },
      ],
      transport: "walk",
    });
    expect(url).toContain("https://www.google.com/maps/dir/?");
    expect(url).toContain("origin=42.4505%2C-76.4862");
    expect(url).toContain("destination=place_id%3AChIJStopTwo");
    expect(url).toContain("waypoints=place_id%3AChIJStopOne");
    expect(url).toContain("travelmode=walking");
  });

  it("keeps itinerary order and maps bus to transit", () => {
    const url = buildGoogleMapsRouteUrl({
      start: { name: "Start", lat: 42.45, lng: -76.48 },
      stops: [
        { name: "One", lat: 42.451, lng: -76.481 },
        { name: "Two", lat: 42.452, lng: -76.482 },
        { name: "Three", lat: 42.453, lng: -76.483 },
      ],
      transport: "bus",
      returnToStart: true,
    });
    expect(url).toContain("travelmode=transit");
    expect(url).toContain("waypoints=42.451%2C-76.481%7C42.452%2C-76.482%7C42.453%2C-76.483");
    expect(url).toContain("destination=42.45%2C-76.48");
  });

  it("decodes an encoded polyline into coordinates", () => {
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points.length).toBeGreaterThan(1);
    expect(points[0].lat).toBeCloseTo(38.5, 1);
    expect(points[0].lng).toBeCloseTo(-120.2, 1);
  });

  it("parses a single Gemini plan or a plans array", () => {
    const one = parseGeminiDatePlans({
      title: "Art & coffee",
      explanation: "A slow museum morning, then a café.",
      stops: [
        {
          name: "Johnson Museum",
          category: "culture",
          estimatedDurationMinutes: 60,
          estimatedCostForTwo: 0,
        },
        {
          name: "Gimme Coffee",
          category: "café",
          estimatedDurationMinutes: 45,
          estimatedCostForTwo: 12,
        },
      ],
    });
    expect(one).toHaveLength(1);
    const many = parseGeminiDatePlans({
      plans: [one[0], { ...one[0], title: "Second walk" }],
    });
    expect(many).toHaveLength(2);
  });

  it("maps Gemini categories onto venue types", () => {
    expect(categoryFrom("coffee shop")).toBe("café");
    expect(categoryFrom("ice cream")).toBe("dessert");
  });
});
