import { z } from "zod";
import {
  criteriaSchema,
  pointSchema,
  type Criteria,
  type Place,
} from "@/types";
import { googleMapsServerKey } from "./config";
import { distance } from "@/lib/routing";

const endpoint = z.object({
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23).default(0),
  minute: z.number().int().min(0).max(59).default(0),
});
const hours = z.object({
  periods: z
    .array(z.object({ open: endpoint, close: endpoint.optional() }))
    .optional(),
});
export const discoveredPlaceSchema = z.object({
  id: z.string().min(1),
  displayName: z.object({ text: z.string().min(1) }),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  formattedAddress: z.string().optional(),
  googleMapsUri: z.url().optional(),
  websiteUri: z.url().optional(),
  types: z.array(z.string()).default([]),
  primaryType: z.string().optional(),
  businessStatus: z.string().optional(),
  priceLevel: z.string().optional(),
  regularOpeningHours: hours.optional(),
});
export function googleHours(
  value: z.infer<typeof hours> | undefined,
): Place["openingHours"] {
  if (!value?.periods?.length) return null;
  const weekly: Record<string, [string, string][]> = Object.fromEntries(
    Array.from({ length: 7 }, (_, i) => [String(i + 1), []]),
  );
  const clock = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  for (const p of value.periods) {
    if (!p.close) {
      // Google represents 24/7 as Sunday 00:00 with no closing endpoint.
      if (p.open.day !== 0 || p.open.hour || p.open.minute) return null;
      for (const key of Object.keys(weekly)) weekly[key] = [["00:00", "24:00"]];
      return { weekly, exceptions: {} };
    }
    const start = p.open.day * 1440 + p.open.hour * 60 + p.open.minute;
    let end = p.close.day * 1440 + p.close.hour * 60 + p.close.minute;
    if (end <= start) end += 7 * 1440;
    // Split multi-day periods, then fitsHours joins adjacent open intervals.
    for (let cursor = start; cursor < end;) {
      const day = Math.floor(cursor / 1440),
        finish = Math.min(end, (day + 1) * 1440);
      weekly[String(day % 7 || 7)].push([
        clock(cursor % 1440),
        clock(finish - day * 1440),
      ]);
      cursor = finish;
    }
  }
  return { weekly, exceptions: {} };
}
export function toDiscoveredPlace(input: unknown): Place | null {
  const parsed = discoveredPlaceSchema.safeParse(input);
  if (!parsed.success) return null;
  const p = parsed.data,
    point = pointSchema.safeParse({
      lat: p.location.latitude,
      lng: p.location.longitude,
    });
  if (
    !point.success ||
    (p.businessStatus && p.businessStatus !== "OPERATIONAL")
  )
    return null;
  const primary = (p.primaryType ?? "").toLowerCase();
  const all = p.types.join(" ").toLowerCase();
  const dessert = /ice_cream|bakery|dessert|confectionery/;
  const food = /restaurant|meal_takeaway|food_court/;
  const cafe = /cafe|coffee|tea_house/;
  const category: Place["category"] = dessert.test(primary)
    ? "dessert"
    : food.test(primary)
      ? "food"
      : cafe.test(primary)
        ? "café"
        : dessert.test(all)
          ? "dessert"
          : food.test(all)
            ? "food"
            : cafe.test(all)
              ? "café"
              : /park|garden|hiking/.test(primary) ||
                  /park|garden|hiking/.test(all)
                ? "park"
                : /book_store/.test(primary) || /book_store/.test(all)
                  ? "free"
                  : "culture";
  const base = {
    café: 18,
    food: 45,
    dessert: 18,
    park: 0,
    culture: 25,
    free: 0,
  }[category];
  const levels: Record<string, number[]> = {
    food: [30, 60, 100, 180],
    café: [16, 24, 36, 50],
    dessert: [16, 24, 36, 50],
    culture: [20, 35, 60, 100],
  };
  const tier = [
    "PRICE_LEVEL_INEXPENSIVE",
    "PRICE_LEVEL_MODERATE",
    "PRICE_LEVEL_EXPENSIVE",
    "PRICE_LEVEL_VERY_EXPENSIVE",
  ].indexOf(p.priceLevel ?? "");
  const price =
    p.priceLevel === "PRICE_LEVEL_FREE"
      ? 0
      : tier >= 0 && levels[category]
        ? levels[category][tier]
        : base;
  const source =
    p.googleMapsUri ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.displayName.text)}&query_place_id=${encodeURIComponent(p.id)}`;
  return {
    id: p.id,
    googlePlaceId: p.id,
    googleMapsUri: source,
    name: p.displayName.text,
    coordinates: point.data,
    address: p.formattedAddress ?? "Ithaca, NY",
    category,
    description: `${category === "park" ? "Outdoor time" : category === "culture" ? "Explore together" : "Take a break together"} at ${p.displayName.text}.`,
    vibeTags: [],
    indoorOutdoor: category === "park" ? "outdoor" : "indoor",
    estimatedCostForTwo: price,
    typicalDurationMinutes: category === "food" ? 60 : 40,
    dietaryTags: [],
    openingHours: googleHours(p.regularOpeningHours),
    websiteUrl: p.websiteUri ?? source,
    sourceUrl: source,
    verifiedAt: new Date().toISOString().slice(0, 10),
    verificationStatus: "needs-verification",
  };
}
export async function discoverPlaces(input: Criteria): Promise<Place[]> {
  const c = criteriaSchema.parse(input),
    key = googleMapsServerKey();
  if (!key) throw new Error("Google Places is not configured.");
  const groups = [
    ["restaurant"],
    ["cafe", "bakery", "ice_cream_shop"],
    [
      "park",
      "museum",
      "art_gallery",
      "book_store",
      "botanical_garden",
      "bowling_alley",
    ],
  ];
  const radius =
    c.transport === "drive"
      ? 12000
      : Math.min(5000, Math.max(500, c.maxWalkKm * 700));
  const fields =
    "id,displayName,location,formattedAddress,googleMapsUri,websiteUri,types,primaryType,businessStatus,priceLevel,regularOpeningHours"
      .split(",")
      .map((f) => `places.${f}`)
      .join(",");
  const found: Place[] = [];
  for (const includedTypes of groups) {
    const r = await fetch(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": fields,
        },
        body: JSON.stringify({
          includedTypes,
          maxResultCount: 20,
          rankPreference: "DISTANCE",
          locationRestriction: {
            circle: {
              center: { latitude: c.start.lat, longitude: c.start.lng },
              radius,
            },
          },
        }),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!r.ok)
      throw new Error(
        `Google Places unavailable (${r.status}). Check Places API access and key restrictions.`,
      );
    const body = z
      .object({ places: z.array(z.unknown()).default([]) })
      .parse(await r.json());
    for (const raw of body.places) {
      const p = toDiscoveredPlace(raw);
      if (
        p &&
        !found.some((x) => x.id === p.id) &&
        distance(c.start, p.coordinates) * 1000 <= radius + 100
      )
        found.push(p);
    }
  }
  return found;
}

const placeFields =
  "id,displayName,location,formattedAddress,googleMapsUri,websiteUri,types,primaryType,businessStatus,priceLevel,regularOpeningHours";
export async function discoverPlaceById(id: string) {
  const key = googleMapsServerKey();
  if (!key) return null;
  const r = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
    {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": placeFields },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!r.ok) return null;
  return toDiscoveredPlace(await r.json());
}
export async function browseRestaurants(criteria: Criteria) {
  const key = googleMapsServerKey();
  if (!key)
    throw new Error(
      "Restaurant discovery is unavailable. Please try again later.",
    );
  const found: Place[] = [];
  const centers = [criteria.start, { lat: 42.4396, lng: -76.4966 }].filter(
    (p, i, all) => i === 0 || distance(p, all[0]) > 0.5,
  );
  for (const center of centers) {
    const r = await fetch(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": placeFields
            .split(",")
            .map((f) => `places.${f}`)
            .join(","),
        },
        body: JSON.stringify({
          includedTypes: ["restaurant"],
          maxResultCount: 20,
          rankPreference: "DISTANCE",
          locationRestriction: {
            circle: {
              center: { latitude: center.lat, longitude: center.lng },
              radius: 5000,
            },
          },
        }),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!r.ok) throw new Error("Restaurants couldn't be loaded. Please retry.");
    const data = z
      .object({ places: z.array(z.unknown()).default([]) })
      .parse(await r.json());
    for (const raw of data.places) {
      const p = toDiscoveredPlace(raw);
      if (p?.category === "food" && !found.some((x) => x.id === p.id))
        found.push(p);
    }
  }
  return found.sort(
    (a, b) =>
      distance(a.coordinates, criteria.start) -
      distance(b.coordinates, criteria.start),
  );
}
