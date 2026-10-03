"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Plan, Point } from "@/types";
import landmarks from "../../../data/landmarks.json";
type Props = {
  plan?: Plan;
  selected?: number;
  onSelect?: (index: number) => void;
  onPick?: (point: Point) => void;
  point?: Point;
};
export default function Map({
  plan,
  selected = 0,
  onSelect,
  onPick,
  point,
}: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    markers = useRef<L.Marker[]>([]),
    callbacks = useRef({ onSelect, onPick });
  const [status, setStatus] = useState("loading"),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    callbacks.current = { onSelect, onPick };
  }, [onSelect, onPick]);
  useEffect(() => {
    if (!container.current) return;
    const m = L.map(container.current, { scrollWheelZoom: false }).setView(
      [42.446, -76.486],
      14,
    );
    map.current = m;
    const tile = L.tileLayer(
      process.env.NEXT_PUBLIC_MAP_TILE_URL ||
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      },
    ).addTo(m);
    tile.on("load", () =>
      setStatus((s) => (s === "error" ? "error" : "ready")),
    );
    tile.on("tileerror", () => setStatus("error"));
    const icon = (text: string, start = false) =>
      L.divIcon({
        className: `pin ${start ? "pin-start" : ""}`,
        html: `<span>${text}</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
      });
    const bounds: L.LatLngExpression[] = [];
    markers.current = [];
    if (plan) {
      if (!plan.start.private) {
        L.marker([plan.start.lat, plan.start.lng], {
          icon: icon("S", true),
          title: "Starting point",
        })
          .addTo(m)
          .bindTooltip("Starting point");
        bounds.push([plan.start.lat, plan.start.lng]);
      }
      plan.stops.forEach((s, i) => {
        const p = s.place.coordinates;
        bounds.push([p.lat, p.lng]);
        const marker = L.marker([p.lat, p.lng], {
          icon: icon(String(i + 1)),
          title: s.place.name,
          alt: `Stop ${i + 1}: ${s.place.name}`,
        }).addTo(m);
        const text = document.createElement("span");
        text.textContent = s.place.name;
        marker
          .bindTooltip(text)
          .on("click", () => callbacks.current.onSelect?.(i));
        markers.current.push(marker);
      });
      for (const leg of plan.legs) {
        if (leg.geometry)
          L.polyline(
            leg.geometry.map((p) => [p.lat, p.lng] as [number, number]),
            {
              color: leg.mode === "walk" ? "#e86a56" : "#365d86",
              weight: 4,
              dashArray: leg.mode === "walk" ? "7 7" : undefined,
            },
          ).addTo(m);
        if (leg.bus)
          for (const p of [leg.bus.boardingPoint, leg.bus.alightingPoint]) {
            L.marker([p.lat, p.lng], {
              icon: icon("B", true),
              title: "Scheduled bus stop",
            }).addTo(m);
            bounds.push([p.lat, p.lng]);
          }
      }
    } else {
      for (const l of landmarks) {
        L.marker([l.lat, l.lng], { icon: icon("•", true), title: l.name })
          .addTo(m)
          .on("click", () => callbacks.current.onPick?.(l));
        bounds.push([l.lat, l.lng]);
      }
      if (point)
        L.marker([point.lat, point.lng], {
          icon: icon("S"),
          title: "Selected start",
        }).addTo(m);
      m.on("click", (e) =>
        callbacks.current.onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }),
      );
    }
    if (bounds.length)
      m.fitBounds(L.latLngBounds(bounds), { padding: [45, 45], maxZoom: 16 });
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
    };
  }, [plan, attempt, point]);
  useEffect(() => {
    markers.current.forEach((marker, i) => {
      marker.getElement()?.classList.toggle("pin-selected", i === selected);
      if (i === selected) marker.openTooltip();
    });
  }, [selected, plan]);
  return (
    <div className="map-shell">
      <div
        ref={container}
        className="leaflet-map"
        role="region"
        aria-label={
          plan ? "Itinerary map" : "Choose a starting point on the map"
        }
      />
      {status === "loading" && (
        <div className="map-status">Loading map tiles…</div>
      )}
      {status === "error" && (
        <div className="map-status">
          Map tiles unavailable. Your itinerary is still here.{" "}
          <button
            onClick={() => {
              setStatus("loading");
              setAttempt((a) => a + 1);
            }}
          >
            Retry map
          </button>
        </div>
      )}
      <div className="map-caption">
        <span className="coral-dot" />{" "}
        {plan
          ? "Numbered stops · walking estimates unless route shown"
          : "Tap a landmark or choose a point"}
        <span className="map-north">N ↑</span>
      </div>
    </div>
  );
}
