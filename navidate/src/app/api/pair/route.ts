import { z } from "zod";
import type { SavedDate } from "@/types";
import { getStorage } from "@/lib/storage";
import { isOwner, hash } from "@/lib/storage/dates";
import { createPair, messagesLink, type Pair } from "@/lib/messaging";
import { body, guard, session, failure, HttpError } from "@/lib/api";
export async function POST(req: Request) {
  try {
    await guard(req);
    if (
      !process.env.SPECTRUM_PROJECT_ID ||
      !process.env.SPECTRUM_PROJECT_SECRET ||
      !process.env.PHOTON_AGENT_ADDRESS
    )
      throw new HttpError(
        503,
        "iMessage is not connected yet. Copy the itinerary text instead.",
      );
    const { shareId } = z
      .object({ shareId: z.string().max(80) })
      .parse(await body(req));
    const saved = await getStorage().get<SavedDate>("date:" + shareId),
      token = await session();
    if (!saved || !isOwner(saved, token))
      throw new HttpError(403, "Only the creator can pair this itinerary.");
    const code = await createPair(hash(token), shareId);
    return Response.json({
      code,
      address: process.env.PHOTON_AGENT_ADDRESS,
      link: messagesLink(process.env.PHOTON_AGENT_ADDRESS, code),
      instruction:
        "Messages should open with the text ready. Press Send within 10 minutes. We’ll reply in that conversation.",
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
