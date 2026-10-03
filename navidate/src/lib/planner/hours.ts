import type { Place } from "@/types";
import { addDays, dateAt, serviceTime, weekday } from "./time";
export function fitsHours(
  place: Place,
  arrival: number,
  departure: number,
): boolean {
  if (!place.openingHours) return true;
  const hours = place.openingHours;
  for (const date of [addDays(dateAt(arrival), -1), dateAt(arrival)]) {
    const windows =
      hours.exceptions[date] ?? hours.weekly[String(weekday(date))] ?? [];
    for (const [open, close] of windows) {
      try {
        const start = serviceTime(date, open);
        const end = serviceTime(close <= open ? addDays(date, 1) : date, close);
        if (arrival >= start && departure <= end) return true;
      } catch {
        /* Ambiguous DST opening windows are not assumed safe. */
      }
    }
  }
  return false;
}
