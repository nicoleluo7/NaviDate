import { HttpError } from "@/lib/api";

const E164 = /^\+[1-9]\d{6,14}$/;

/** US 10-digit numbers become +1. Anything else must already include a country code. */
export function toE164(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, "");
  const normalized = compact.startsWith("+")
    ? compact
    : compact.length === 10
      ? `+1${compact}`
      : compact.length === 11 && compact.startsWith("1")
        ? `+${compact}`
        : "";
  return E164.test(normalized) ? normalized : null;
}

function photonMessage(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object") {
    const nested = (record.error as Record<string, unknown>).message;
    if (typeof nested === "string") return nested;
  }
  return "";
}

export async function registerSharedUser(
  phoneNumber: string,
  fetchImpl: typeof fetch = fetch,
) {
  const projectId = process.env.SPECTRUM_PROJECT_ID,
    secret = process.env.SPECTRUM_PROJECT_SECRET;
  if (!projectId || !secret)
    throw new HttpError(
      503,
      "iMessage is not connected yet. Copy the itinerary text instead.",
    );
  const response = await fetchImpl(
    `https://spectrum.photon.codes/projects/${projectId}/users/`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${projectId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "shared", phoneNumber }),
    },
  );
  const body = await response.json().catch(() => null);
  const assigned =
    body &&
    typeof body === "object" &&
    "data" in body &&
    body.data &&
    typeof body.data === "object" &&
    "assignedPhoneNumber" in body.data &&
    typeof body.data.assignedPhoneNumber === "string"
      ? body.data.assignedPhoneNumber
      : "";
  if (response.ok && E164.test(assigned)) return assigned;
  const detail = photonMessage(body);
  console.error("Photon user registration failed", response.status, detail);
  if (/maxSharedUsers|maximum number of shared/i.test(detail))
    throw new HttpError(
      403,
      "Photon can’t add another phone on this project right now.",
    );
  if (response.status === 400)
    throw new HttpError(
      400,
      "Enter the phone number you use with iMessage, including the country code.",
    );
  throw new HttpError(
    502,
    "Photon could not register that phone. Try again in a minute.",
  );
}
