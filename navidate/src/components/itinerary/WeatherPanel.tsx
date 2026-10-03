import { CloudSun, Droplets, Wind } from "lucide-react";
import type { Weather } from "@/types";
import { displayTime } from "@/lib/planner/time";
export default function WeatherPanel({ weather }: { weather: Weather }) {
  const hours = weather.hours?.filter(
    (h) =>
      (!weather.startsAt ||
        Date.parse(h.time) + 3600000 > Date.parse(weather.startsAt)) &&
      (!weather.endsAt || Date.parse(h.time) < Date.parse(weather.endsAt)),
  );
  return (
    <aside className="weather-panel" aria-label="Weather for your date">
      <div className="weather-heading">
        <CloudSun size={23} />
        <div>
          <h3>
            {weather.available
              ? "Weather for your date"
              : "Forecast unavailable"}
          </h3>
          <p>
            {weather.available
              ? weather.summary
              : "Your plan still works. Check the forecast closer to your date."}
          </p>
        </div>
      </div>
      {weather.startsAt && weather.endsAt && (
        <p className="weather-window">
          {displayTime(weather.startsAt)} – {displayTime(weather.endsAt)}
        </p>
      )}
      {weather.available && <p className="weather-advice">{weather.advice}</p>}
      {!!hours?.length && (
        <div
          className="weather-hours"
          tabIndex={0}
          aria-label="Hourly forecast, scroll for more hours"
        >
          {hours.map((h) => (
            <div className="weather-hour" key={h.time}>
              <time dateTime={h.time}>
                {new Intl.DateTimeFormat("en-US", {
                  timeZone: "America/New_York",
                  hour: "numeric",
                }).format(new Date(h.time))}
              </time>
              <strong>{Math.round((h.temperature * 9) / 5 + 32)}°F</strong>
              <span>
                <Droplets size={13} />
                {h.rain}%
              </span>
              <span>
                <Wind size={13} />
                {Math.round(h.wind / 1.609)} mph
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="weather-source">
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{" "}
        ·{" "}
        {weather.available
          ? "Forecast, not a guarantee. Precipitation chance includes rain and snow."
          : "Hourly forecasts may be unavailable beyond 16 days or during a service interruption."}
        {weather.fetchedAt && ` Updated ${displayTime(weather.fetchedAt)}.`}
      </p>
    </aside>
  );
}
