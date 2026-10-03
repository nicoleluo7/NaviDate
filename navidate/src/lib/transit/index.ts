import { z } from "zod";
import { pointSchema, type Point } from "@/types";
import { addDays, dateAt, serviceTime, weekday } from "@/lib/planner/time";
const meta = {
  sourceUrl: z.url(),
  verifiedAt: z.iso.date(),
  demo: z.boolean(),
};
export const transitStopSchema = z.object({
  id: z.string(),
  name: z.string(),
  coordinates: pointSchema,
  ...meta,
});
export const routeSchema = z.object({
  id: z.string(),
  number: z.string(),
  name: z.string(),
  direction: z.string(),
  fareForTwo: z.number().nonnegative(),
  ...meta,
});
export const calendarSchema = z
  .object({
    id: z.string(),
    weekdays: z.array(z.number().int().min(1).max(7)),
    start: z.iso.date(),
    end: z.iso.date(),
    exceptions: z.record(z.string(), z.boolean()),
    ...meta,
  })
  .refine((x) => x.start <= x.end, "Service start must precede end");
export const tripSchema = z.object({
  id: z.string(),
  routeId: z.string(),
  serviceId: z.string(),
  direction: z.string(),
  stopTimes: z
    .array(
      z.object({
        stopId: z.string(),
        time: z.string().regex(/^(?:[0-3]\d|4[0-7]):[0-5]\d$/),
      }),
    )
    .min(2),
  ...meta,
});
export type TransitData = {
  stops: z.infer<typeof transitStopSchema>[];
  routes: z.infer<typeof routeSchema>[];
  trips: z.infer<typeof tripSchema>[];
  calendars: z.infer<typeof calendarSchema>[];
};
export type WalkEstimate = {
  minutes: number;
  km: number;
  geometry?: Point[];
  encodedPolyline?: string;
  label: string;
};
export type WalkLookup = (
  from: Point & { id?: string },
  to: Point & { id?: string },
) => WalkEstimate | null;
export function runsOn(
  calendar: TransitData["calendars"][number],
  date: string,
) {
  return (
    calendar.exceptions[date] ??
    (date >= calendar.start &&
      date <= calendar.end &&
      calendar.weekdays.includes(weekday(date)))
  );
}
export function directTrips(
  data: TransitData,
  from: Point & { id?: string },
  to: Point & { id?: string },
  ready: number,
  walk: WalkLookup,
  buffer = 5,
  allowDemo = false,
) {
  const results = [];
  for (const trip of data.trips) {
    if (trip.demo && !allowDemo) continue;
    const route = data.routes.find(
      (r) => r.id === trip.routeId && r.direction === trip.direction,
    );
    const calendar = data.calendars.find((c) => c.id === trip.serviceId);
    if (!route || !calendar) continue;
    for (const serviceDate of [
      addDays(dateAt(ready), -1),
      dateAt(ready),
      addDays(dateAt(ready), 1),
    ]) {
      if (!runsOn(calendar, serviceDate)) continue;
      for (let i = 0; i < trip.stopTimes.length - 1; i++)
        for (let j = i + 1; j < trip.stopTimes.length; j++) {
          const board = data.stops.find(
              (s) => s.id === trip.stopTimes[i].stopId,
            ),
            alight = data.stops.find((s) => s.id === trip.stopTimes[j].stopId);
          if (!board || !alight) continue;
          const before = walk(from, { ...board.coordinates, id: board.id }),
            after = walk({ ...alight.coordinates, id: alight.id }, to);
          if (!before || !after) continue;
          try {
            const departure = serviceTime(serviceDate, trip.stopTimes[i].time),
              arrival = serviceTime(serviceDate, trip.stopTimes[j].time);
            if (
              departure < ready + (before.minutes + buffer) * 60000 ||
              arrival < departure ||
              departure - ready > 3 * 3600000
            )
              continue;
            results.push({
              route,
              trip,
              board,
              alight,
              before,
              after,
              departure,
              arrival,
              end: arrival + after.minutes * 60000,
              wait: (departure - ready) / 60000 - before.minutes,
              serviceDate,
            });
          } catch {
            /* Ignore ambiguous DST service times; never guess. */
          }
        }
    }
  }
  return results.sort((a, b) => a.end - b.end);
}
