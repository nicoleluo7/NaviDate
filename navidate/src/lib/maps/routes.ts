import { z } from "zod";
import type { Point } from "@/types";
import { createWalkingRouter, type WalkingRouter } from "@/lib/routing";
import type { WalkEstimate } from "@/lib/transit";
import { googleMapsServerKey, normalizePlaceId } from "./config";
import { decodePolyline } from "./polyline";

const routeSchema = z.object({
  routes: z
    .array(
      z.object({
        duration: z.string().optional(),
        distanceMeters: z.number().optional(),
        polyline: z.object({ encodedPolyline: z.string().optional() }).optional(),
        legs: z
          .array(
            z.object({
              duration: z.string().optional(),
              distanceMeters: z.number().optional(),
              polyline: z
                .object({ encodedPolyline: z.string().optional() })
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

function seconds(value?: string) {
  const match = value?.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) : 0;
}

function waypoint(point: Point & { googlePlaceId?: string; id?: string }) {
  if (point.googlePlaceId)
    return { placeId: normalizePlaceId(point.googlePlaceId) };
  return {
    location: { latLng: { latitude: point.lat, longitude: point.lng } },
  };
}

export async function computeRoute(
  origin: Point & { googlePlaceId?: string },
  destination: Point & { googlePlaceId?: string },
  travelMode: "WALK" | "TRANSIT",
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
          "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: waypoint(origin),
        destination: waypoint(destination),
        travelMode,
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
  const encoded =
    route.legs?.[0]?.polyline?.encodedPolyline ||
    route.polyline?.encodedPolyline;
  const meters =
    route.legs?.[0]?.distanceMeters ?? route.distanceMeters ?? 0;
  const duration = seconds(route.legs?.[0]?.duration ?? route.duration);
  return {
    minutes: Math.max(1, Math.ceil(duration / 60)),
    km: meters / 1000,
    encodedPolyline: encoded,
    geometry: encoded ? decodePolyline(encoded) : undefined,
  };
}

function estimate(
  result: NonNullable<Awaited<ReturnType<typeof computeRoute>>>,
  mode: "WALK" | "TRANSIT",
): WalkEstimate {
  return {
    minutes: result.minutes,
    km: result.km,
    geometry: result.geometry,
    encodedPolyline: result.encodedPolyline,
    label:
      mode === "TRANSIT"
        ? "Google Maps transit route"
        : "Google Maps walking route",
  };
}

export function createGoogleRouter(
  transport: "walk" | "bus",
): WalkingRouter {
  const fallback = createWalkingRouter();
  const cache = new Map<string, Promise<WalkEstimate | null>>();
  return {
    route(from, to) {
      const key = JSON.stringify([from, to, transport]);
      if (cache.has(key)) return cache.get(key)!;
      const pending = (async () => {
        const modes: ("WALK" | "TRANSIT")[] =
          transport === "bus" ? ["TRANSIT", "WALK"] : ["WALK"];
        for (const mode of modes) {
          try {
            const result = await computeRoute(from, to, mode);
            if (result) return estimate(result, mode);
          } catch {
            /* Try the next mode or the local graph. */
          }
        }
        return fallback.route(from, to);
      })();
      cache.set(key, pending);
      return pending;
    },
  };
}

export function createPlannerRouter(
  transport: "walk" | "bus" = "walk",
): WalkingRouter {
  return googleMapsServerKey()
    ? createGoogleRouter(transport)
    : createWalkingRouter();
}
