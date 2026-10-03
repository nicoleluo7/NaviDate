import { z } from "zod";
import { readFileSync } from "node:fs";
import { placeSchema } from "../src/types";
import {
  transitStopSchema,
  routeSchema,
  tripSchema,
  calendarSchema,
} from "../src/lib/transit";
import graph from "../data/walking/graph.json";
export function validateTransit(raw: {
  stops: unknown;
  routes: unknown;
  trips: unknown;
  calendars: unknown;
}) {
  const stops = z.array(transitStopSchema).parse(raw.stops),
    routes = z.array(routeSchema).parse(raw.routes),
    trips = z.array(tripSchema).parse(raw.trips),
    calendars = z.array(calendarSchema).parse(raw.calendars);
  const errors: string[] = [];
  for (const [name, rows] of [
    ["stop", stops],
    ["route", routes],
    ["trip", trips],
    ["calendar", calendars],
  ] as const)
    if (new Set(rows.map((r) => r.id)).size !== rows.length)
      errors.push(`Duplicate ${name} IDs`);
  for (const c of calendars)
    for (const date of Object.keys(c.exceptions))
      if (!z.iso.date().safeParse(date).success)
        errors.push(`Invalid exception date: ${date}`);
  for (const t of trips) {
    const route = routes.find((r) => r.id === t.routeId);
    if (!route) errors.push(`${t.id}: missing route`);
    if (route && route.direction !== t.direction)
      errors.push(`${t.id}: wrong direction`);
    if (!calendars.some((c) => c.id === t.serviceId))
      errors.push(`${t.id}: missing calendar`);
    let prior = -1;
    for (const time of t.stopTimes) {
      if (!stops.some((s) => s.id === time.stopId))
        errors.push(`${t.id}: missing stop ${time.stopId}`);
      const [h, m] = time.time.split(":").map(Number),
        current = h * 60 + m;
      if (current <= prior) errors.push(`${t.id}: nonmonotonic stop times`);
      prior = current;
    }
  }
  return errors;
}
function main() {
  const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));
  const venues = z.array(placeSchema).parse(read("data/places.json"));
  const errors = validateTransit({
    stops: read("data/transit/stops.json"),
    routes: read("data/transit/routes.json"),
    trips: read("data/transit/trips.json"),
    calendars: read("data/transit/service-calendar.json"),
  });
  if (new Set(venues.map((p) => p.id)).size !== venues.length)
    errors.push("Duplicate venue IDs");
  for (const p of venues) {
    if (!p.verifiedAt)
      console.warn(`NEEDS VERIFICATION: ${p.id} has no verification date`);
    if (!p.openingHours) console.warn(`UNKNOWN HOURS: ${p.id}`);
  }
  for (const e of graph.edges) {
    if (
      !venues.some((p) => p.id === e.from) ||
      !venues.some((p) => p.id === e.to)
    )
      errors.push("Walking graph has a missing reference");
    if (e.meters <= 0) errors.push("Walking graph has invalid distance");
  }
  if (!graph.verifiedAt)
    console.warn(
      "Walking graph: field verification and geometry are unavailable. Estimates only.",
    );
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      `Validated ${venues.length} venues and all transit references/calendars. Unknown metadata reported above; no real bus service is seeded.`,
    );
}
if (process.argv[1]?.endsWith("validate-data.ts")) main();
