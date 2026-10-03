import { z } from "zod";
import { pointSchema, type Place } from "@/types";
import { googleMapsServerKey, normalizePlaceId } from "./config";

export type ResolvedPlace = {
  googlePlaceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  googleMapsUri: string;
  websiteUrl?: string;
};

const placeResult = z.object({
  id: z.string().optional(),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional(),
  googleMapsUri: z.string().optional(),
  websiteUri: z.string().optional(),
});

const fields =
  "id,displayName,formattedAddress,location,googleMapsUri,websiteUri";

function mapsUrl(id: string, name: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(id)}`;
}

function toResolved(
  data: z.infer<typeof placeResult>,
  fallbackName: string,
): ResolvedPlace | null {
  const googlePlaceId = data.id ? normalizePlaceId(data.id) : "";
  const name = data.displayName?.text || fallbackName;
  if (!googlePlaceId || !data.location) return null;
  const point = pointSchema.safeParse({
    lat: data.location.latitude,
    lng: data.location.longitude,
  });
  if (!point.success) return null;
  return {
    googlePlaceId,
    name,
    address: data.formattedAddress || name,
    lat: point.data.lat,
    lng: point.data.lng,
    googleMapsUri: /^https?:\/\//.test(data.googleMapsUri ?? "")
      ? data.googleMapsUri!
      : mapsUrl(googlePlaceId, name),
    websiteUrl: /^https?:\/\//.test(data.websiteUri ?? "")
      ? data.websiteUri
      : undefined,
  };
}

async function mapsFetch(url: string, init?: RequestInit) {
  const key = googleMapsServerKey();
  if (!key) throw new Error("Google Maps is not configured");
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": fields,
      ...init?.headers,
    },
    signal: init?.signal ?? AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error("Places lookup failed");
  return response.json();
}

export async function placeDetails(placeId: string) {
  const id = normalizePlaceId(placeId);
  const body = await mapsFetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
  );
  return toResolved(placeResult.parse(body), id);
}

export async function searchPlace(
  query: string,
  near: { lat: number; lng: number },
) {
  const body = await mapsFetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 3,
      locationBias: {
        circle: {
          center: { latitude: near.lat, longitude: near.lng },
          radius: 12000,
        },
      },
    }),
  });
  const parsed = z.object({ places: z.array(placeResult).optional() }).parse(body);
  for (const place of parsed.places ?? []) {
    const resolved = toResolved(place, query);
    if (resolved) return resolved;
  }
  return null;
}

export async function resolveStop(
  stop: {
    name: string;
    address?: string;
    placeId?: string;
  },
  near: { lat: number; lng: number },
) {
  if (stop.placeId)
    try {
      const details = await placeDetails(stop.placeId);
      if (details) return details;
    } catch {
      /* Try a text search next. */
    }
  const queries = [
    stop.address ? `${stop.name}, ${stop.address}` : "",
    `${stop.name} Ithaca NY`,
    stop.name,
  ].filter(Boolean);
  for (const query of queries) {
    try {
      const found = await searchPlace(query, near);
      if (found) return found;
    } catch {
      /* Next query. */
    }
  }
  return null;
}

export function categoryFrom(value: string): Place["category"] {
  const text = value.toLowerCase();
  if (/caf|coffee|tea/.test(text)) return "café";
  if (/dessert|sweet|ice cream|bakery|chocolate/.test(text)) return "dessert";
  if (/food|restaurant|dinner|lunch|eat/.test(text)) return "food";
  if (/park|garden|outdoor|trail|slope/.test(text)) return "park";
  if (/free|plaza|quad/.test(text)) return "free";
  return "culture";
}
