import { z } from "zod";
import type { Criteria, Weather, WeatherHour } from "@/types";
import { dateAt, addDays, localTime, iso } from "@/lib/planner/time";
const numbers = (schema: z.ZodNumber) => z.array(schema.nullable());
const schema = z.object({
  hourly: z.object({
    time: z.array(z.number().int()),
    temperature_2m: numbers(z.number().min(-90).max(70)),
    precipitation_probability: numbers(z.number().min(0).max(100)),
    precipitation: numbers(z.number().nonnegative()),
    snowfall: numbers(z.number().nonnegative()),
    wind_speed_10m: numbers(z.number().nonnegative()),
    weather_code: numbers(z.number().int().min(0).max(99)),
  }),
});
export const unavailableWeather = (): Weather => ({
  available: false,
  summary: "Forecast unavailable",
  source: "Open-Meteo",
  advice: "Keep planning; check conditions closer to your date.",
});
export function weatherForWindow(
  weather: Weather,
  start: number,
  end: number,
): Weather {
  if (!weather.hours) return weather;
  const hours = weather.hours.filter(
    (h) => Date.parse(h.time) < end && Date.parse(h.time) + 3600000 > start,
  );
  const first = hours[0],
    last = hours.at(-1);
  if (
    !first ||
    !last ||
    Date.parse(first.time) > start ||
    Date.parse(last.time) + 3600000 < end ||
    hours.some(
      (h, i) =>
        i > 0 && Date.parse(h.time) - Date.parse(hours[i - 1].time) !== 3600000,
    )
  )
    return unavailableWeather();
  const low = Math.min(...hours.map((h) => h.temperature)),
    high = Math.max(...hours.map((h) => h.temperature));
  const rain = Math.max(...hours.map((h) => h.rain)),
    wind = Math.max(...hours.map((h) => h.wind));
  const severe = hours.some((h) => h.code >= 95 || h.wind >= 60);
  const wet = hours.some(
    (h) =>
      h.rain >= 60 ||
      h.precipitation >= 0.5 ||
      h.snow > 0 ||
      [56, 57, 66, 67].includes(h.code),
  );
  const advice = severe
    ? "Storms or strong wind forecast. Avoid outdoor activities and reconsider walking."
    : wet
      ? "Wet weather expected. Indoor stops are favored; bring rain protection for the walk."
      : wind >= 35
        ? "Breezy during your date. Sheltered stops are favored."
        : low <= 0
          ? "Freezing temperatures forecast. Indoor stops are favored; check for slippery paths."
          : high >= 32
            ? "Hot weather forecast. Favor indoor breaks and bring water."
            : "No substantial precipitation indicated during this window. Check again before leaving.";
  const fahrenheit = (n: number) => Math.round((n * 9) / 5 + 32);
  return {
    ...weather,
    available: true,
    hours,
    low,
    high,
    rain,
    wind,
    wet,
    severe,
    advice,
    startsAt: iso(start),
    endsAt: iso(end),
    summary: `${fahrenheit(low)}–${fahrenheit(high)}°F · up to ${rain}% precipitation chance`,
  };
}
export function favorsIndoors(weather?: Weather) {
  return (
    !!weather?.available &&
    (!!weather.wet ||
      !!weather.severe ||
      (weather.wind ?? 0) >= 35 ||
      (weather.low ?? 10) <= 0 ||
      (weather.high ?? 20) >= 32)
  );
}
export async function getWeather(c: Criteria): Promise<Weather> {
  const today = dateAt(Date.now());
  if (
    process.env.DISABLE_EXTERNAL_APIS === "true" ||
    c.date < today ||
    c.date > addDays(today, 15)
  )
    return unavailableWeather();
  const start = localTime(c.date, c.time),
    end = start + c.duration * 60000;
  if (dateAt(end) > addDays(today, 15)) return unavailableWeather();
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(c.start.lat),
      longitude: String(c.start.lng),
      hourly:
        "temperature_2m,precipitation_probability,precipitation,snowfall,wind_speed_10m,weather_code",
      timezone: "America/New_York",
      timeformat: "unixtime",
      forecast_days: "16",
      temperature_unit: "celsius",
      wind_speed_unit: "kmh",
      precipitation_unit: "mm",
    }).toString();
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return unavailableWeather();
    const { hourly: h } = schema.parse(await res.json());
    if (Object.values(h).some((values) => values.length !== h.time.length))
      return unavailableWeather();
    const hours: WeatherHour[] = [];
    for (let i = 0; i < h.time.length - 1; i++) {
      // Accumulated precipitation/snow describe the preceding hour, so use the next endpoint.
      const temperature = h.temperature_2m[i],
        rain = h.precipitation_probability[i + 1];
      const precipitation = h.precipitation[i + 1],
        snow = h.snowfall[i + 1],
        wind = h.wind_speed_10m[i],
        code = h.weather_code[i];
      if (
        [temperature, rain, precipitation, snow, wind, code].some(
          (v) => v == null,
        )
      )
        continue;
      if (h.time[i + 1] - h.time[i] !== 3600) return unavailableWeather();
      hours.push({
        time: iso(h.time[i] * 1000),
        temperature: temperature!,
        rain: rain!,
        precipitation: precipitation!,
        snow: snow!,
        wind: wind!,
        code: code!,
      });
    }
    const full: Weather = {
      available: true,
      summary: "",
      source: "Open-Meteo hourly forecast",
      fetchedAt: iso(Date.now()),
      hours,
    };
    const summary = weatherForWindow(full, start, end);
    // Keep the requested window's hourly data for evaluating individual activities and swaps.
    return summary;
  } catch {
    return unavailableWeather();
  }
}
