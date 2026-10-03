export function googleMapsServerKey() {
  if (process.env.DISABLE_EXTERNAL_APIS === "true") return "";
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
}

export function geminiModel() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

export function geminiConfigured() {
  return (
    !!process.env.GEMINI_API_KEY?.trim() &&
    process.env.DISABLE_EXTERNAL_APIS !== "true"
  );
}

export function normalizePlaceId(id: string) {
  return id.replace(/^places\//, "");
}
