"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Plan, Point } from "@/types";
import landmarks from "../../../data/landmarks.json";
type Props = {
  plan?: Plan;
  selected?: number | null;
  focus?: number;
  onSelect?: (index: number) => void;
  onClear?: () => void;
  onPick?: (point: Point) => void;
  point?: Point;
};
export default function Map({
  plan,
  selected = null,
  focus = 0,
  onSelect,
  onClear,
  onPick,
  point,
}: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    markers = useRef<L.Marker[]>([]),
    selection = useRef(selected),
    overview = useRef<L.LatLngBounds | null>(null),
    pendingFocus = useRef<L.LatLng | "route" | null>(null),
    callbacks = useRef({ onSelect, onClear, onPick });
  const [status, setStatus] = useState("loading"),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    callbacks.current = { onSelect, onClear, onPick };
    selection.current = selected;
  }, [onSelect, onClear, onPick, selected]);
  useEffect(() => {
    if (!container.current) return;
    const m = L.map(container.current, {
      scrollWheelZoom: false,
      zoomControl: false,
    }).setView([42.446, -76.486], 14);
    map.current = m;
    L.control.zoom({ position: "bottomright" }).addTo(m);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(m);
    const tile = L.tileLayer(
      process.env.NEXT_PUBLIC_MAP_TILE_URL?.replace(/%7B/gi, "{").replace(
        /%7D/gi,
        "}",
      ) || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
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
        className: `map-pin ${start ? "map-pin-start" : ""} ${text === "B" ? "map-pin-bus" : ""}`,
        html: `<span class="pin-body"><span>${text === "S" ? "↗" : text}</span></span>`,
        iconSize: [44, 48],
        iconAnchor: [22, 46],
        tooltipAnchor: [0, -42],
      });
    const bounds: L.LatLngExpression[] = [];
    markers.current = [];
    if (plan) {
      if (!plan.start.private) {
        L.marker([plan.start.lat, plan.start.lng], {
          icon: icon("S", true),
          title: "Starting point: " + plan.start.name,
          alt: "Starting point: " + plan.start.name,
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
          .bindTooltip(text, { direction: "top", className: "venue-tooltip" })
          .on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            callbacks.current.onSelect?.(i);
          });
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
      m.on("click", (e) => {
        const target = e.originalEvent?.target;
        if (target instanceof Element && target.closest(".leaflet-control"))
          return;
        callbacks.current.onClear?.();
      });
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
    const box = bounds.length ? L.latLngBounds(bounds) : null;
    overview.current = box;
    if (box) m.fitBounds(box, { padding: [45, 45], maxZoom: 16 });
    const reduceMotion = () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const showRoute = () => {
      if (!overview.current) return;
      const options = { padding: [45, 45] as [number, number], maxZoom: 16 };
      if (reduceMotion())
        m.fitBounds(overview.current, { ...options, animate: false });
      else m.flyToBounds(overview.current, { ...options, duration: 0.5 });
    };
    const showStop = (target: L.LatLng) => {
      if (reduceMotion()) m.setView(target, 17, { animate: false });
      else m.flyTo(target, 17, { duration: 0.5 });
    };
    const observer = new ResizeObserver(() => {
      m.invalidateSize();
      const target =
        pendingFocus.current ??
        (selection.current == null
          ? "route"
          : markers.current[selection.current]?.getLatLng()) ??
        "route";
      if (!container.current?.offsetWidth) return;
      pendingFocus.current = null;
      if (target === "route") showRoute();
      else showStop(target);
    });
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
    };
  }, [plan, attempt, point]);
  useEffect(() => {
    markers.current.forEach((marker, i) => {
      const on = i === selected;
      marker.getElement()?.classList.toggle("pin-selected", on);
      marker.setZIndexOffset(on ? 1000 : 0);
      if (on) marker.openTooltip();
      else marker.closeTooltip();
    });
  }, [selected, plan]);
  useEffect(() => {
    if (!focus || !map.current) return;
    const marker = selected == null ? undefined : markers.current[selected];
    map.current.invalidateSize();
    if (!marker || !overview.current) {
      pendingFocus.current = marker ? null : "route";
      if (!container.current?.offsetWidth) return;
      pendingFocus.current = null;
      if (!overview.current) return;
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const options = { padding: [45, 45] as [number, number], maxZoom: 16 };
      if (reduce)
        map.current.fitBounds(overview.current, { ...options, animate: false });
      else
        map.current.flyToBounds(overview.current, {
          ...options,
          duration: 0.5,
        });
      return;
    }
    const target = marker.getLatLng();
    if (!container.current?.offsetWidth) {
      pendingFocus.current = target;
      return;
    }
    pendingFocus.current = null;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) map.current.setView(target, 17, { animate: false });
    else map.current.flyTo(target, 17, { duration: 0.5 });
  }, [focus, selected, plan, attempt]);
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
      {plan && (
        <button
          className="map-overview"
          onClick={() => {
            callbacks.current.onClear?.();
            if (map.current && overview.current)
              map.current.fitBounds(overview.current, {
                padding: [50, 50],
                maxZoom: 16,
                animate: false,
              });
          }}
          aria-label="Show all stops on the map"
        >
          ↗ Show all stops
        </button>
      )}
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
          ? "↗ Start · Numbered stops · Tap a pin to explore"
          : "Tap a landmark or choose a point"}
        <span className="map-north">N ↑</span>
      </div>
    </div>
  );
}
