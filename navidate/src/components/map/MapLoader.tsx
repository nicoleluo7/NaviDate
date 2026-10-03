"use client";
import dynamic from "next/dynamic";
const MapLoader = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => <div className="map-placeholder">Getting the map ready…</div>,
});
export default MapLoader;
