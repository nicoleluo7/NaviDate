import type { Criteria, Place } from "@/types";

export type RouteStop = {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  /** A personal start has no public place name, so the link keeps its coordinates. */
  private?: boolean;
};

function namedPlace(point: RouteStop) {
  const name = point.name?.trim() ?? "";
  // A raw Places id is not a stop name. Maps shows it as "place_id:" plus the id.
  if (/^(?:place_id:|places\/)/i.test(name)) return "";
  return name;
}

function withCity(place: string) {
  return /ithaca/i.test(place) ? place : `${place}, Ithaca, NY`;
}

export function mapsPlaceQuery(point: RouteStop) {
  const name = namedPlace(point);
  const hidden =
    point.private ||
    name === "My location" ||
    name === "Selected map point" ||
    name === "Private starting point hidden";
  if (!name || hidden) {
    if (!hidden && point.address) return withCity(point.address);
    if (point.lat != null && point.lng != null)
      return `${point.lat},${point.lng}`;
  }
  const place = [name, point.address].filter(Boolean).join(", ");
  if (!place) return name;
  return withCity(place);
}

function placeKey(point: RouteStop) {
  return namedPlace(point)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function samePlace(a: RouteStop, b: RouteStop) {
  const left = placeKey(a);
  const right = placeKey(b);
  return !!left && left === right;
}

export function routePoints({
  start,
  stops,
  returnToStart = false,
}: {
  start: RouteStop;
  stops: RouteStop[];
  returnToStart?: boolean;
}) {
  const points = [start, ...stops, ...(returnToStart ? [start] : [])];
  return points.filter(
    (point, index) => index === 0 || !samePlace(point, points[index - 1]),
  );
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
  const points = routePoints({ start, stops, returnToStart });
  if (points.length < 2) return undefined;
  const params = new URLSearchParams({
    api: "1",
    origin: mapsPlaceQuery(points[0]),
    destination: mapsPlaceQuery(points.at(-1)!),
    travelmode:
      transport === "bus"
        ? "transit"
        : transport === "drive"
          ? "driving"
          : "walking",
  });
  const middle = points.slice(1, -1);
  if (middle.length)
    params.set("waypoints", middle.map(mapsPlaceQuery).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function directionsToPlace(
  place: {
    name: string;
    address?: string;
    googlePlaceId?: string;
  },
  transport: "walk" | "drive" = "walk",
) {
  const params = new URLSearchParams({
    api: "1",
    destination: mapsPlaceQuery(place),
    travelmode: transport === "drive" ? "driving" : "walking",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function planRoute(plan: {
  googleMapsUrl?: string;
  start: { name: string; lat: number; lng: number; private?: boolean };
  stops: {
    place: {
      name: string;
      address?: string;
      coordinates?: { lat: number; lng: number };
      googlePlaceId?: string;
    };
  }[];
  legs?: { mode: string; toName: string }[];
}) {
  const legs = plan.legs ?? [];
  const driving =
    legs.some((leg) => leg.mode === "drive") ||
    /[?&]travelmode=driving(?:&|$)/i.test(plan.googleMapsUrl ?? "");
  return {
    start: {
      name: plan.start.name,
      lat: plan.start.lat,
      lng: plan.start.lng,
      private: plan.start.private,
    },
    stops: plan.stops.map((stop) => ({
      name: stop.place.name,
      address: stop.place.address,
      lat: stop.place.coordinates?.lat,
      lng: stop.place.coordinates?.lng,
    })),
    transport: (legs.some((leg) => leg.mode === "bus")
      ? "bus"
      : driving
        ? "drive"
        : "walk") as Criteria["transport"],
    returnToStart: legs.at(-1)?.toName === plan.start.name,
  };
}

export function routeUrlForPlan(plan: {
  googleMapsUrl?: string;
  start: { name: string; lat: number; lng: number; private?: boolean };
  stops: {
    place: {
      name: string;
      address?: string;
      coordinates?: { lat: number; lng: number };
      googlePlaceId?: string;
    };
  }[];
  legs?: { mode: string; toName: string }[];
}) {
  if (!plan.stops.length) return plan.googleMapsUrl;
  return buildGoogleMapsRouteUrl(planRoute(plan)) ?? plan.googleMapsUrl;
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
      private: start.private,
    },
    stops: places.map((place) => ({
      name: place.name,
      address: place.address,
      lat: place.coordinates.lat,
      lng: place.coordinates.lng,
      googlePlaceId: place.googlePlaceId,
    })),
  };
}
