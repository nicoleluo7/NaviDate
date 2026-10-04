"use client";
import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { Plan, Point } from "@/types";
import landmarks from "../../../data/landmarks.json";
import { decodePolyline } from "@/lib/maps/polyline";

type Props = {
  plan?: Plan;
  selected?: number | null;
  focus?: number;
  onSelect?: (index: number) => void;
  onClear?: () => void;
  onPick?: (point: Point) => void;
  point?: Point;
};

type Pin = {
  marker: google.maps.marker.AdvancedMarkerElement;
  element: HTMLDivElement;
  stopIndex?: number;
};

let mapsConfigured = false;
function loadMaps(key: string) {
  if (!mapsConfigured) {
    setOptions({ key, v: "quarterly" });
    mapsConfigured = true;
  }
  return importLibrary("maps");
}

export default function GoogleMapView({
  plan,
  selected = null,
  focus = 0,
  onSelect,
  onClear,
  onPick,
  point,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const pins = useRef<Pin[]>([]);
  const lines = useRef<google.maps.Polyline[]>([]);
  const overview = useRef<google.maps.LatLngBounds | null>(null);
  const callbacks = useRef({ onSelect, onClear, onPick });
  const selection = useRef(selected);
  const [status, setStatus] = useState(
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? "loading" : "error",
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    callbacks.current = { onSelect, onClear, onPick };
    selection.current = selected;
  }, [onSelect, onClear, onPick, selected]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!container.current) return;
    if (!key) return;
    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];
    const timeout = setTimeout(() => {
      if (!cancelled) setStatus("error");
    }, 15000);
    let resize: ResizeObserver | undefined;
    void loadMaps(key)
      .then(async (maps) => {
        const { AdvancedMarkerElement } = (await importLibrary(
          "marker",
        )) as google.maps.MarkerLibrary;
        if (cancelled || !container.current) return;
        const instance = new maps.Map(container.current, {
          center: { lat: 42.446, lng: -76.486 },
          zoom: 14,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "cooperative",
        });
        map.current = instance;
        const bounds = new google.maps.LatLngBounds();
        const addPoint = (lat: number, lng: number) => {
          bounds.extend({ lat, lng });
        };
        const addMarker = (
          position: google.maps.LatLng,
          title: string,
          label?: string,
          stopIndex?: number,
          onClick?: () => void,
        ) => {
          const element = document.createElement("div");
          element.className = "google-date-pin";
          element.classList.toggle("google-date-pin-start", label === "S");
          element.dataset.pin = label ?? "location";
          if (stopIndex != null) element.dataset.stopIndex = String(stopIndex);
          element.textContent = "";
          const marker = new AdvancedMarkerElement({
            map: instance,
            position,
            title,
            content: element,
          });
          if (onClick) listeners.push(marker.addListener("click", onClick));
          pins.current.push({ marker, element, stopIndex });
        };
        if (plan) {
          if (!plan.start.private) {
            addMarker(
              new google.maps.LatLng(plan.start.lat, plan.start.lng),
              "Starting point: " + plan.start.name,
              "S",
            );
            addPoint(plan.start.lat, plan.start.lng);
          }
          plan.stops.forEach((stop, i) => {
            addPoint(stop.place.coordinates.lat, stop.place.coordinates.lng);
            addMarker(
              new google.maps.LatLng(
                stop.place.coordinates.lat,
                stop.place.coordinates.lng,
              ),
              `Stop ${i + 1}: ${stop.place.name}`,
              String(i + 1),
              i,
              () => callbacks.current.onSelect?.(i),
            );
          });
          for (const leg of plan.legs) {
            const path =
              leg.geometry ??
              (leg.encodedPolyline ? decodePolyline(leg.encodedPolyline) : []);
            if (!path.length) continue;
            const line = new maps.Polyline({
              map: instance,
              path,
              strokeColor: leg.mode === "bus" ? "#386e72" : "#bc422f",
              strokeOpacity: 0.9,
              strokeWeight: 5,
              ...(leg.mode === "walk"
                ? {
                    strokeOpacity: 0,
                    icons: [
                      {
                        icon: {
                          path: "M 0,-1 0,1",
                          strokeOpacity: 0.9,
                          scale: 3,
                        },
                        offset: "0",
                        repeat: "14px",
                      },
                    ],
                  }
                : {}),
            });
            lines.current.push(line);
            path.forEach((p) => addPoint(p.lat, p.lng));
          }
          listeners.push(
            instance.addListener("click", () => callbacks.current.onClear?.()),
          );
        } else {
          for (const landmark of landmarks) {
            addMarker(
              new google.maps.LatLng(landmark.lat, landmark.lng),
              landmark.name,
              undefined,
              undefined,
              () => callbacks.current.onPick?.(landmark),
            );
            addPoint(landmark.lat, landmark.lng);
          }
          if (point) {
            addMarker(
              new google.maps.LatLng(point.lat, point.lng),
              "Selected start",
              "S",
            );
            addPoint(point.lat, point.lng);
          }
          listeners.push(
            instance.addListener(
              "click",
              (event: google.maps.MapMouseEvent) => {
                const loc = event.latLng;
                if (loc)
                  callbacks.current.onPick?.({
                    lat: loc.lat(),
                    lng: loc.lng(),
                  });
              },
            ),
          );
        }
        overview.current = bounds.isEmpty() ? null : bounds;
        if (overview.current) instance.fitBounds(overview.current, 45);
        clearTimeout(timeout);
        resize = new ResizeObserver(() => {
          if (map.current && overview.current) {
            google.maps.event.trigger(map.current, "resize");
            map.current.fitBounds(overview.current, 45);
          }
        });
        resize.observe(container.current);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      resize?.disconnect();
      listeners.forEach((listener) => listener.remove());
      pins.current.forEach((pin) => (pin.marker.map = null));
      pins.current = [];
      lines.current.forEach((line) => line.setMap(null));
      lines.current = [];
      map.current = null;
    };
  }, [plan, attempt, point]);

  useEffect(() => {
    pins.current.forEach((pin) => {
      if (pin.stopIndex == null) return;
      const on = pin.stopIndex === selected;
      pin.marker.zIndex = on ? 1000 : pin.stopIndex;
      pin.element.classList.toggle("is-selected", on);
      pin.element.classList.toggle("pin-selected", on);
    });
  }, [selected, plan, status]);

  useEffect(() => {
    if (!focus || !map.current || !overview.current) return;
    const pin =
      selected == null
        ? undefined
        : pins.current.find((p) => p.stopIndex === selected);
    if (!pin || selected == null) {
      map.current.fitBounds(overview.current, 50);
      return;
    }
    const stop = plan?.stops[selected];
    if (!stop) return;
    map.current.panTo(stop.place.coordinates);
    map.current.setZoom(17);
  }, [focus, selected, plan, attempt]);

  return (
    <div className="map-shell">
      <div
        ref={container}
        className="google-map itinerary-map"
        role="region"
        aria-label={
          plan ? "Itinerary map" : "Choose a starting point on the map"
        }
      />
      {status === "loading" && (
        <div className="map-status">Loading Google Map…</div>
      )}
      {status === "error" && (
        <div className="map-status">
          Google Map unavailable. Your itinerary is still here.{" "}
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
          ? "Start · Numbered stops · Tap a pin to explore"
          : "Tap a landmark or choose a point"}
        {plan && (
          <button
            className="map-overview-inline"
            onClick={() => {
              callbacks.current.onClear?.();
              if (map.current && overview.current)
                map.current.fitBounds(overview.current, 50);
            }}
            aria-label="Show all stops on the map"
          >
            Show all stops
          </button>
        )}
        <span className="map-north">N ↑</span>
      </div>
    </div>
  );
}
