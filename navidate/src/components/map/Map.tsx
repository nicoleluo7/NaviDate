"use client";
import LeafletMap from "./LeafletMap";
import GoogleMapView from "./GoogleMap";
import type { Plan, Point } from "@/types";

export default function Map(props: {
  plan?: Plan;
  selected?: number | null;
  focus?: number;
  onSelect?: (index: number) => void;
  onClear?: () => void;
  onPick?: (point: Point) => void;
  point?: Point;
}) {
  if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
    return <GoogleMapView {...props} />;
  return <LeafletMap {...props} />;
}
