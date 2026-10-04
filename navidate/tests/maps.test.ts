import { describe, it, expect } from "vitest";
import { decodePolyline } from "../src/lib/maps/polyline";
import {
  buildGoogleMapsRouteUrl,
  routeUrlForPlan,
} from "../src/lib/maps/googleMapsUrl";
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
    const params = new URL(url!).searchParams;
    expect(url).toContain("https://www.google.com/maps/dir/?");
    expect(params.get("origin")).toBe("Johnson Museum, Ithaca, NY");
    expect(params.get("destination")).toBe("Gimme Coffee, Ithaca, NY");
    expect(params.get("destination_place_id")).toBeNull();
    expect(params.get("waypoints")).toBe("Hound and Mare, Ithaca, NY");
    expect(params.get("waypoint_place_ids")).toBeNull();
    expect(decodeURIComponent(url!)).not.toContain("place_id:");
    expect(params.get("travelmode")).toBe("walking");
    expect(url).not.toContain("42.4505");
  });

  it("keeps waypoint IDs aligned and omits them for mixed known/unknown IDs", () => {
    const make = (second?: string) =>
      new URL(
        buildGoogleMapsRouteUrl({
          start: { name: "Ho Plaza" },
          stops: [
            { name: "First", googlePlaceId: "id-one" },
            { name: "Second", googlePlaceId: second },
            { name: "Libe Slope" },
          ],
          transport: "walk",
        })!,
      ).searchParams;
    expect(make("id-two").get("waypoint_place_ids")).toBeNull();
    expect(make().get("waypoint_place_ids")).toBeNull();
    expect(make().get("waypoints")).toBe(
      "First, Ithaca, NY|Second, Ithaca, NY",
    );
  });
  it("builds a route link from a plan that was saved without one", () => {
    const url = routeUrlForPlan({
      start: { name: "Arts Quad", lat: 42.45, lng: -76.48 },
      stops: [
        {
          place: {
            name: "Collegetown Bagels",
            coordinates: { lat: 42.44, lng: -76.49 },
          },
        },
        {
          place: {
            name: "Hound and Mare",
            address: "118 N. Aurora Street",
            coordinates: { lat: 42.441, lng: -76.5 },
            googlePlaceId: "ChIJHound",
          },
        },
      ],
      legs: [{ mode: "walk", toName: "Hound and Mare" }],
    });
    const params = new URL(url!).searchParams;
    expect(params.get("destination")).toBe(
      "Hound and Mare, 118 N. Aurora Street, Ithaca, NY",
    );
    expect(params.get("destination_place_id")).toBeNull();
    expect(params.get("waypoints")).toBe("Collegetown Bagels, Ithaca, NY");
    expect(params.get("travelmode")).toBe("walking");
  });

  it("replaces a coordinate link so mobile maps shows place names", () => {
    const url = routeUrlForPlan({
      googleMapsUrl:
        "https://www.google.com/maps/dir/?api=1&origin=42.4505%2C-76.4862&destination=42.4407%2C-76.4963&travelmode=walking",
      start: { name: "Johnson Museum of Art", lat: 42.4505, lng: -76.4862 },
      stops: [
        {
          place: {
            name: "Gimme! Coffee · Cayuga Street",
            address: "506 W State St",
            coordinates: { lat: 42.4449, lng: -76.4998 },
          },
        },
        {
          place: {
            name: "Hound and Mare",
            address: "118 N. Aurora Street",
            coordinates: { lat: 42.4407, lng: -76.4963 },
          },
        },
      ],
      legs: [
        { mode: "walk", toName: "Gimme! Coffee · Cayuga Street" },
        { mode: "walk", toName: "Hound and Mare" },
        { mode: "walk", toName: "Johnson Museum of Art" },
      ],
    });
    const params = new URL(url!).searchParams;
    expect(params.get("origin")).toBe("Johnson Museum of Art, Ithaca, NY");
    expect(params.get("destination")).toBe("Johnson Museum of Art, Ithaca, NY");
    expect(params.get("waypoints")).toBe(
      "Gimme! Coffee · Cayuga Street, 506 W State St, Ithaca, NY|Hound and Mare, 118 N. Aurora Street, Ithaca, NY",
    );
    expect(url).not.toContain("42.4505");
  });

  it("uses the street address when a stop name is a raw place id", () => {
    const url = buildGoogleMapsRouteUrl({
      start: { name: "Beebe Lake", lat: 42.45, lng: -76.48 },
      stops: [
        {
          name: "place_id:ChIJabcdefghijklmnopqrstuvwxyz",
          address: "1 Libe Slope",
          lat: 42.447,
          lng: -76.484,
        },
        { name: "Paris Baguette", address: "123 Dryden Rd", lat: 42.44, lng: -76.48 },
      ],
      transport: "walk",
    });
    const params = new URL(url!).searchParams;
    expect(params.get("waypoints")).toBe("1 Libe Slope, Ithaca, NY");
    expect(decodeURIComponent(url!)).not.toContain("place_id:");
    expect(params.get("destination")).toBe(
      "Paris Baguette, 123 Dryden Rd, Ithaca, NY",
    );
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
    const params = new URL(url!).searchParams;
    expect(params.get("travelmode")).toBe("transit");
    expect(params.get("waypoints")).toBe(
      "One, Ithaca, NY|Two, Ithaca, NY|Three, Ithaca, NY",
    );
    expect(params.get("destination")).toBe("Start, Ithaca, NY");
    expect(url).not.toContain("42.451");
  });

  it("maps drive to driving travel mode", () => {
    const url = buildGoogleMapsRouteUrl({
      start: { name: "Start", lat: 42.45, lng: -76.48 },
      stops: [{ name: "One", lat: 42.451, lng: -76.481 }],
      transport: "drive",
    });
    expect(new URL(url!).searchParams.get("travelmode")).toBe("driving");
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
