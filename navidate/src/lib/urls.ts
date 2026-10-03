/** Public links sent in messages must be reachable on the recipient's phone. */
export function publicAppUrl() {
  const configured = (
    process.env.PUBLIC_APP_URL || "https://navidate.us"
  ).trim();
  try {
    const url = new URL(configured);
    if (url.protocol === "https:" || url.protocol === "http:")
      return url.origin;
  } catch {}
  return "https://navidate.us";
}
