import { z } from "zod";
import graph from "../../../data/walking/graph.json";
import { places } from "@/lib/data";
import type { Point } from "@/types";
import type { WalkEstimate, WalkLookup } from "@/lib/transit";
export type WalkingRouter = {
  route(
    from: Point & { id?: string; googlePlaceId?: string },
    to: Point & { id?: string; googlePlaceId?: string },
  ): Promise<WalkEstimate | null>;
};
export function distance(a: Point, b: Point) {
  return Math.hypot((a.lat - b.lat) * 111.2, (a.lng - b.lng) * 82.1);
}
export const localWalk: WalkLookup = (a, b) => {
  if (distance(a, b) < 0.015)
    return { minutes: 0, km: 0, label: "Same location" };
  const identify = (p: Point & { id?: string }) =>
    places.find((x) => x.id === p.id && distance(x.coordinates, p) < 0.03)
      ?.id ?? places.find((x) => distance(x.coordinates, p) < 0.03)?.id;
  const start = identify(a),
    end = identify(b);
  if (!start || !end) return null;
  const distances = new Map<string, number>([[start, 0]]),
    visited = new Set<string>();
  while (true) {
    const node = [...distances]
      .filter(([id]) => !visited.has(id))
      .sort((a, b) => a[1] - b[1])[0];
    if (!node) return null;
    if (node[0] === end)
      return {
        minutes: Math.ceil(node[1] / 65),
        km: node[1] / 1000,
        label: "Walking estimate · path not field-verified",
      };
    visited.add(node[0]);
    for (const e of graph.edges) {
      const next = e.from === node[0] ? e.to : e.to === node[0] ? e.from : null;
      if (next && node[1] + e.meters < (distances.get(next) ?? Infinity))
        distances.set(next, node[1] + e.meters);
    }
  }
};
const orsSchema = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({
          type: z.literal("LineString"),
          coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
        }),
        properties: z.object({
          summary: z.object({
            distance: z.number().nonnegative(),
            duration: z.number().nonnegative(),
          }),
        }),
      }),
    )
    .min(1),
});
export function createWalkingRouter(): WalkingRouter {
  const cache = new Map<string, Promise<WalkEstimate | null>>();
  let calls = 0;
  return {
    route(a, b) {
      const key = JSON.stringify([a, b]);
      if (cache.has(key)) return cache.get(key)!;
      const result = (async () => {
        if (
          process.env.ORS_API_KEY &&
          process.env.DISABLE_EXTERNAL_APIS !== "true" &&
          calls++ < 12
        ) {
          try {
            const response = await fetch(
              "https://api.openrouteservice.org/v2/directions/foot-walking/geojson",
              {
                method: "POST",
                headers: {
                  Authorization: process.env.ORS_API_KEY,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  coordinates: [
                    [a.lng, a.lat],
                    [b.lng, b.lat],
                  ],
                }),
                signal: AbortSignal.timeout(3500),
              },
            );
            if (response.ok) {
              const f = orsSchema.parse(await response.json()).features[0];
              return {
                minutes: Math.ceil(f.properties.summary.duration / 60),
                km: f.properties.summary.distance / 1000,
                geometry: f.geometry.coordinates.map(([lng, lat]) => ({
                  lat,
                  lng,
                })),
                label: "OpenRouteService · walking route estimate",
              };
            }
          } catch {
            /* Local estimate fallback. */
          }
        }
        return localWalk(a, b);
      })();
      cache.set(key, result);
      return result;
    },
  };
}
