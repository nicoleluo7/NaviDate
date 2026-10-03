import { Temporal } from "@js-temporal/polyfill";
export const ZONE = "America/New_York";
export function localTime(date: string, time: string): number {
  try {
    return Number(
      Temporal.ZonedDateTime.from(`${date}T${time}[${ZONE}]`, {
        disambiguation: "reject",
      }).epochMilliseconds,
    );
  } catch {
    throw new Error(
      "Choose a valid, unambiguous New York time. This time falls in a daylight-saving clock change or is not a valid date.",
    );
  }
}
export function dateAt(ms: number) {
  return Temporal.Instant.fromEpochMilliseconds(ms)
    .toZonedDateTimeISO(ZONE)
    .toPlainDate()
    .toString();
}
export function addDays(date: string, days: number) {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}
export function weekday(date: string) {
  return Temporal.PlainDate.from(date).dayOfWeek;
}
export function serviceTime(date: string, time: string) {
  const [h, m] = time.split(":").map(Number);
  return localTime(
    addDays(date, Math.floor(h / 24)),
    `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  );
}
export const iso = (ms: number) => new Date(ms).toISOString();
export const displayTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
    timeZoneName: "short",
  }).format(new Date(value));
export function approximateDuration(minutes: number) {
  const step = minutes >= 60 ? 15 : 5;
  const rounded = Math.max(
    step,
    Math.round(Math.max(0, minutes) / step) * step,
  );
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours === 0) return `about ${mins} minutes`;
  const hourLabel = hours === 1 ? "1 hour" : `${hours} hours`;
  if (mins === 0) return `about ${hourLabel}`;
  return `about ${hourLabel} and ${mins} minutes`;
}
