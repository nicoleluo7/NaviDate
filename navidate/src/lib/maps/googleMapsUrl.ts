import type { Criteria, Place } from "@/types";

export type RouteStop = {
  name: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
};

function waypoint(point: RouteStop) {
  if (point.googlePlaceId) return `place_id:${point.googlePlaceId}`;
  if (point.lat != null && point.lng != null)
    return `${point.lat},${point.lng}`;
  return point.name;
}

export function buildGoogleMapsRouteUrl({
  start,
  stops,
  transport,
  returnToStart = false,
}: {
  start: RouteStop;
  stops: RouteStop[];
  transport: Criteria["transport"];
  returnToStart?: boolean;
}) {
  if (!stops.length) return undefined;
  const origin = waypoint(start);
  const destination = waypoint(returnToStart ? start : stops.at(-1)!);
  const middle = returnToStart ? stops : stops.slice(0, -1);
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: transport === "bus" ? "transit" : "walking",
  });
  if (middle.length)
    params.set("waypoints", middle.map(waypoint).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function routeStopsFromPlaces(
  start: Criteria["start"],
  places: Place[],
) {
  return {
    start: {
      name: start.name,
      lat: start.lat,
      lng: start.lng,
      googlePlaceId: undefined,
    },
    stops: places.map((place) => ({
      name: place.name,
      lat: place.coordinates.lat,
      lng: place.coordinates.lng,
      googlePlaceId: place.googlePlaceId,
    })),
  };
}
