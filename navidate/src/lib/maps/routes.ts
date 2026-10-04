import { z } from "zod";
import type { Point } from "@/types";
import {
  createWalkingRouter,
  type WalkingRouter,
  distance,
} from "@/lib/routing";
import type { WalkEstimate } from "@/lib/transit";
import { googleMapsServerKey, normalizePlaceId } from "./config";
import { decodePolyline } from "./polyline";
const routeSchema = z.object({
  routes: z
    .array(
      z.object({
        duration: z.string().regex(/^\d+(?:\.\d+)?s$/),
        distanceMeters: z.number().nonnegative(),
        polyline: z.object({ encodedPolyline: z.string().min(1) }),
      }),
    )
    .optional(),
});
const waypoint = (point: Point & { googlePlaceId?: string }) =>
  point.googlePlaceId
    ? { placeId: normalizePlaceId(point.googlePlaceId) }
    : { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
export async function computeRoute(
  origin: Point & { googlePlaceId?: string },
  destination: Point & { googlePlaceId?: string },
  travelMode: "WALK" | "DRIVE",
) {
  const key = googleMapsServerKey();
  if (!key) return null;
  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: waypoint(origin),
        destination: waypoint(destination),
        travelMode,
        ...(travelMode === "DRIVE"
          ? { routingPreference: "TRAFFIC_UNAWARE" }
          : {}),
        polylineEncoding: "ENCODED_POLYLINE",
        computeAlternativeRoutes: false,
        languageCode: "en-US",
        units: "METRIC",
      }),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) return null;
  const route = routeSchema.parse(await response.json()).routes?.[0];
  if (!route) return null;
  const duration = Number(route.duration.slice(0, -1)),
    geometry = decodePolyline(route.polyline.encodedPolyline);
  if (!duration || !route.distanceMeters || geometry.length < 2) return null;
  // Reject corrupted or unrelated geometry, instead of plotting a misleading path.
  if (
    distance(geometry[0], origin) > 0.5 ||
    distance(geometry.at(-1)!, destination) > 0.5
  )
    return null;
  return {
    minutes: Math.ceil(duration / 60),
    km: route.distanceMeters / 1000,
    geometry,
    encodedPolyline: route.polyline.encodedPolyline,
  };
}
export function createGoogleRouter(
  travelMode: "WALK" | "DRIVE" = "WALK",
): WalkingRouter {
  const cache = new Map<string, Promise<WalkEstimate | null>>();
  let calls = 0;
  const label =
    travelMode === "DRIVE"
      ? "Google Maps · estimated driving time"
      : "Google Maps · estimated walking time";
  return {
    route(from, to) {
      if (distance(from, to) < 0.01)
        return Promise.resolve({ minutes: 0, km: 0, label: "Same location" });
      const key = JSON.stringify([from.lat, from.lng, to.lat, to.lng]);
      if (cache.has(key)) return cache.get(key)!;
      const pending = (async () => {
        if (calls++ >= 24) return null;
        try {
          const result = await computeRoute(from, to, travelMode);
          return result ? { ...result, label } : null;
        } catch {
          return null;
        }
      })();
      cache.set(key, pending);
      return pending;
    },
  };
}
export function createPlannerRouter(
  transport: "walk" | "bus" | "drive" = "walk",
): WalkingRouter {
  // Scheduled bus planning remains in the transit engine, with fares and waits.
  if (!googleMapsServerKey()) return createWalkingRouter();
  return createGoogleRouter(transport === "drive" ? "DRIVE" : "WALK");
}
