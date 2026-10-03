import { z } from "zod";
import type { SavedDate } from "@/types";
import type { Draft } from "../plan/route";
import { getStorage } from "@/lib/storage";
import { isOwner, saveDate } from "@/lib/storage/dates";
import { body, guard, session, failure, HttpError } from "@/lib/api";
export async function POST(req: Request) {
  try {
    await guard(req);
    const input = z
      .object({
        draftId: z.string().max(80),
        planId: z.string().max(80),
        shareId: z.string().max(80).optional(),
      })
      .parse(await body(req));
    const store = getStorage(),
      token = await session(),
      draft = await store.get<Draft>("draft:" + input.draftId);
    if (!draft || draft.expires < Date.now())
      throw new HttpError(410, "This draft expired. Generate it again.");
    if (!isOwner(draft, token))
      throw new HttpError(403, "Only this draft’s creator can save it.");
    const plan = draft.plans.find((p) => p.id === input.planId);
    if (!plan) throw new HttpError(400, "Choose a generated plan.");
    let saved: SavedDate;
    if (input.shareId) {
      const old = await store.get<SavedDate>("date:" + input.shareId);
      if (!old || !isOwner(old, token))
        throw new HttpError(403, "This link is read-only.");
      saved = { ...old, criteria: draft.criteria, plan };
      await store.put("date:" + saved.shareId, saved);
    } else saved = await saveDate(draft.criteria, plan, token, store);
    return Response.json({
      shareId: saved.shareId,
      url: "/date/" + saved.shareId,
    });
  } catch (e) {
    return failure(e);
  }
}
