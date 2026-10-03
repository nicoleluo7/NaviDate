import { z } from "zod";
import type { SavedDate } from "@/types";
import { getStorage } from "@/lib/storage";
import { isOwner, hash } from "@/lib/storage/dates";
import { createPair, messagesLink, type Pair } from "@/lib/messaging";
import { registerSharedUser, toE164 } from "@/lib/messaging/photon";
import { body, guard, session, failure, HttpError } from "@/lib/api";
export async function POST(req: Request) {
  try {
    await guard(req);
    if (
      !process.env.SPECTRUM_PROJECT_ID ||
      !process.env.SPECTRUM_PROJECT_SECRET
    )
      throw new HttpError(
        503,
        "iMessage is not connected yet. Copy the itinerary text instead.",
      );
    const parsed = z
      .object({
        shareId: z.string().min(1).max(80),
        phone: z.string().max(40),
      })
      .safeParse(await body(req));
    if (!parsed.success)
      throw new HttpError(
        400,
        "Enter the phone number you use with iMessage.",
      );
    const { shareId, phone } = parsed.data;
    const e164 = toE164(phone);
    if (!e164)
      throw new HttpError(
        400,
        "Enter the phone number you use with iMessage, including the country code.",
      );
    const store = getStorage();
    const saved = await store.get<SavedDate>("date:" + shareId),
      token = await session();
    if (!saved || !isOwner(saved, token))
      throw new HttpError(403, "Only the creator can pair this itinerary.");
    const minute = Math.floor(Date.now() / 60000);
    let allowed = false;
    for (let i = 0; i < 8; i++)
      if (await store.claim(`photon-register:${minute}:${i}`, true)) {
        allowed = true;
        break;
      }
    if (!allowed)
      throw new HttpError(
        429,
        "Too many phones registered just now. Try again in a minute.",
      );
    const address = await registerSharedUser(e164);
    const code = await createPair(hash(token), shareId, store);
    return Response.json({
      code,
      address,
      link: messagesLink(address, code),
      instruction:
        "Messages should open a text to the number Photon assigned this phone. Press Send within 10 minutes. We’ll reply in that conversation.",
    });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: Request) {
  try {
    const code = new URL(req.url).searchParams.get("code") ?? "",
      pair = await getStorage().get<Pair>("pair:" + hash(code));
    if (!pair || pair.ownerHash !== hash(await session()))
      throw new HttpError(404, "Pairing not found.");
    return Response.json({
      status:
        pair.expires < Date.now() && pair.status === "waiting"
          ? "expired"
          : pair.status,
    });
  } catch (e) {
    return failure(e);
  }
}
