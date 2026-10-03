"use client";
import { useState } from "react";
import { Button } from "react-aria-components";
import { Search, Utensils, Check } from "lucide-react";
import type { Criteria, Place } from "@/types";

export default function RestaurantBrowser({
  criteria,
  onChoose,
  disabled,
}: {
  criteria: Criteria;
  onChoose: (id?: string) => void;
  disabled: boolean;
}) {
  const [places, setPlaces] = useState<Place[]>([]),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [opened, setOpened] = useState(false);
  async function load() {
    setOpened(true);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setPlaces(data.places);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't load restaurants. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  const filtered = places.filter((p) =>
    `${p.name} ${p.address}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="restaurant-browser" aria-label="Choose a restaurant">
      <div className="restaurant-browser-heading">
        <div>
          <h3>A place you have in mind?</h3>
          <p>Let Navi choose, or build your date around a restaurant.</p>
        </div>
        <Button
          type="button"
          className="secondary"
          isDisabled={busy || disabled}
          onPress={() => void load()}
        >
          <Utensils size={17} />
          {busy
            ? "Finding restaurants…"
            : opened
              ? "Refresh restaurants"
              : "Browse restaurants"}
        </Button>
      </div>
      {criteria.restaurantId && (
        <div className="restaurant-selection" role="status">
          <Check size={17} />
          <span>
            {places.find((p) => p.id === criteria.restaurantId)?.name ??
              "Selected restaurant"}{" "}
            is included in your request.
          </span>
          <Button
            type="button"
            className="text-button"
            onPress={() => onChoose(undefined)}
          >
            Clear
          </Button>
        </div>
      )}
      {opened && (
        <>
          <label className="restaurant-search">
            <Search size={18} />
            <input
              aria-label="Search restaurants"
              placeholder="Search by name or neighborhood"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <p className="small muted">
            Nearby results from Google Maps, not a complete directory. Prices
            for two are estimates. We check hours and travel when planning.
          </p>
          {error && <p role="alert">{error}</p>}
          {!busy && !error && !filtered.length && (
            <p>No restaurants found. Try another name or starting location.</p>
          )}
          <div className="restaurant-list">
            {filtered.map((p) => (
              <article
                key={p.id}
                className={
                  criteria.restaurantId === p.id
                    ? "restaurant-card selected"
                    : "restaurant-card"
                }
              >
                <div>
                  <h4>{p.name}</h4>
                  <p>{p.address}</p>
                  <span className="small muted">
                    About ${p.estimatedCostForTwo} for two
                  </span>
                </div>
                <Button
                  type="button"
                  className="secondary"
                  isDisabled={disabled}
                  aria-pressed={criteria.restaurantId === p.id}
                  onPress={() => onChoose(p.id)}
                >
                  {criteria.restaurantId === p.id ? (
                    <>
                      <Check size={16} />
                      Selected
                    </>
                  ) : (
                    "Choose"
                  )}
                </Button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
