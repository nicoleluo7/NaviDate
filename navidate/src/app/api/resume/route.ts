import { z } from "zod";
import { criteriaSchema, type SavedDate } from "@/types";
import { body, guard, session, failure, HttpError } from "@/lib/api";
import { getStorage } from "@/lib/storage";
import { hash, isOwner, randomId } from "@/lib/storage/dates";
import { routeUrlForPlan } from "@/lib/maps/googleMapsUrl";
import type { Draft } from "../plan/route";
export async function POST(req: Request) {
  try {
    await guard(req);
    const { shareId } = z
      .object({ shareId: z.string().min(1).max(80).optional() })
      .parse(await body(req));
    const token = await session(),
      store = getStorage();
    if (!token) {
      if (shareId)
        throw new HttpError(
          403,
          "This date is read-only. Only its creator can edit it.",
        );
      return Response.json({ saved: null });
    }
    const id =
      shareId ?? (await store.get<string>("creator:last:" + hash(token)));
    if (!id) return Response.json({ saved: null });
    const saved = await store.get<SavedDate>("date:" + id);
    if (!saved || !isOwner(saved, token))
      throw new HttpError(
        403,
        "This date is read-only. Open its share page to view it, or plan a new date.",
      );
    const criteria = criteriaSchema.parse(saved.criteria),
      draftId = randomId(),
      plan = { ...saved.plan, googleMapsUrl: routeUrlForPlan(saved.plan) };
    await store.put("draft:" + draftId, {
      ownerHash: hash(token),
      criteria,
      plans: [plan],
      expires: Date.now() + 3600000,
    } satisfies Draft);
    return Response.json({
      saved: { shareId: id, url: "/date/" + id },
      criteria,
      plan,
      draftId,
    });
  } catch (e) {
    return failure(e);
  }
}
