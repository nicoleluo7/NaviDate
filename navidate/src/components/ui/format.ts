export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function formatWalkMiles(km: number) {
  return `${(km * 0.621371).toFixed(1)} miles`;
}
