import type { Point } from "@/types";
export function decodePolyline(encoded: string): Point[] {
  if (encoded.length > 200000) throw new Error("Route geometry too large");
  const points: Point[] = [];
  let i = 0,
    lat = 0,
    lng = 0;
  const next = () => {
    let result = 0,
      shift = 0,
      b: number;
    do {
      if (i >= encoded.length || shift > 30)
        throw new Error("Invalid route geometry");
      b = encoded.charCodeAt(i++) - 63;
      if (b < 0 || b > 63) throw new Error("Invalid route geometry");
      result |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lng += next();
    if (Math.abs(lat) > 9000000 || Math.abs(lng) > 18000000)
      throw new Error("Invalid coordinates");
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
