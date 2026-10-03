import { z } from "zod";
import type { Criteria, Weather } from "@/types";
import { dateAt, addDays } from "@/lib/planner/time";
const schema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number().nullable()),
    precipitation_probability_max: z.array(z.number().nullable()),
  }),
});
export async function getWeather(c: Criteria): Promise<Weather> {
  const unavailable: Weather = {
    available: false,
    summary: "Forecast unavailable",
    source: "Open-Meteo",
  };
  const today = dateAt(Date.now());
  if (
    process.env.DISABLE_EXTERNAL_APIS === "true" ||
    c.date < today ||
    c.date > addDays(today, 15)
  )
    return unavailable;
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(c.start.lat),
      longitude: String(c.start.lng),
      daily: "temperature_2m_max,precipitation_probability_max",
      timezone: "America/New_York",
      forecast_days: "16",
    }).toString();
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return unavailable;
    const { daily } = schema.parse(await res.json()),
      i = daily.time.indexOf(c.date),
      rain = daily.precipitation_probability_max[i],
      high = daily.temperature_2m_max[i];
    if (i < 0 || rain == null || high == null) return unavailable;
    return {
      available: true,
      rain,
      high,
      summary: `High ${Math.round(high)}°C · ${rain}% chance of rain`,
      source: "Open-Meteo daily forecast",
    };
  } catch {
    return unavailable;
  }
}
