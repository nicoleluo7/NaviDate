import type { Place } from "@/types";
import { addDays, dateAt, serviceTime, weekday } from "./time";
export function fitsHours(
  place: Place,
  arrival: number,
  departure: number,
): boolean {
  if (!place.openingHours) return true;
  const hours = place.openingHours,
    intervals: [number, number][] = [];
  for (let offset = -1; offset <= 1; offset++) {
    const date = addDays(dateAt(arrival), offset);
    for (const [open, close] of hours.exceptions[date] ??
      hours.weekly[String(weekday(date))] ??
      []) {
      try {
        intervals.push([
          serviceTime(date, open),
          serviceTime(close <= open ? addDays(date, 1) : date, close),
        ]);
      } catch {
        /* Ambiguous DST hours are not assumed open. */
      }
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let covered = arrival;
  for (const [start, end] of intervals) {
    if (start <= covered && end > covered) covered = end;
  }
  return covered >= departure;
}
