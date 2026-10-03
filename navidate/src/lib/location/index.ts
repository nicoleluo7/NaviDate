import { pointSchema, type Criteria } from "@/types";
export function locationFromPosition(
  position: Pick<GeolocationPosition, "coords">,
): Criteria["start"] {
  const result = pointSchema.safeParse({
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  });
  if (!result.success)
    throw new Error(
      "You’re outside the Cornell/Ithaca planning area. Choose an Ithaca landmark or a point on the map; your existing start hasn’t changed.",
    );
  if (position.coords.accuracy > 1500)
    throw new Error(
      "Your location is too approximate. Enable precise location or choose a point on the map.",
    );
  return { ...result.data, name: "My location", private: true };
}
export function locationError(code: number) {
  if (code === 1)
    return "Location permission was denied. Allow location for this site in browser settings, then try again, or choose a landmark.";
  if (code === 3)
    return "Finding your location took too long. Try again near a window or choose a point on the map.";
  return "Your device couldn’t determine its location. Check location services or choose a landmark.";
}
